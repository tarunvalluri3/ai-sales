import { buildWelcome, hasWelcomeTemplate, isGreetingOnly } from "@/lib/answer-bank/greeting";
import { CATALOG_ENTRY_KEY, isCatalogQuestion } from "@/lib/answer-bank/catalog";
import {
  faqGuardRefusal,
  hasInjectionSignal,
  isSelfContained,
  numbersMissingFrom,
  scriptsCompatible,
} from "@/lib/answer-bank/eligibility";
import { MAX_INSTANT_MESSAGE_CHARS, normalizeQuestionKey, tokenize } from "@/lib/answer-bank/normalize";
import { servableFormatRefusal } from "@/lib/answer-bank/output-check";

/**
 * The one decision function behind instant answers. Pure: every lookup is an
 * injected dependency, so the rules are unit-testable without a database and
 * the same function serves every channel (lib/rag.ts prepareTurn calls it
 * before retrieval and before any model call).
 *
 * Two phases, split on whether an embedding is needed:
 *   1. `decideLocalInstant` -- greeting, exact suggested question, catalog
 *      question. No embedding, at most one indexed lookup.
 *   2. `decideFaqInstant`  -- the high-similarity FAQ match. Needs the query
 *      embedding, so the caller runs it CONCURRENTLY with retrieval and
 *      abandons retrieval on a hit.
 * Every refusal is a miss, and a miss means "the AI answers as it always has".
 */

/** Cosine similarity a FAQ question must reach before its answer is served. Measured 2026-10-28: genuine paraphrases 0.81-0.98, near-misses up to 0.90. */
export const FAQ_MIN_SIMILARITY = 0.92;
/** How far the best FAQ must beat the second best. Below this the question sits between two FAQs and the AI decides. */
export const FAQ_MIN_GAP = 0.1;

export type InstantSource = "greeting" | "suggested" | "faq" | "catalog";

export type InstantHit = {
  source: InstantSource;
  answer: string;
  entryId: string | null;
  faqId: string | null;
  sourceChunkIds: string[];
  similarity: number | null;
};

export type InstantOutcome = { hit: InstantHit } | { hit: null; reason: string };

/** What the caller knows about the business and the request. Anything absent means "not eligible". */
export type InstantContext = {
  businessName: string;
  /** Master switch for the caller: false for the sandbox (owners must test the real pipeline) and any channel not yet enabled. */
  enabled: boolean;
  /** The business is published. The widget path guarantees it; DB lookups re-check it in SQL. */
  published: boolean;
  suggestedQuestions: string[];
  /** The visitor clicked a suggested-question chip. Analytics only -- it never selects an answer. */
  suggestedClick: boolean;
};

export type LocalInstantInput = {
  message: string;
  language: string;
  isFirstTurn: boolean;
  context: InstantContext;
};

export type StoredEntry = { id: string; answer: string; sourceChunkIds: string[] };

export type LocalInstantDeps = {
  lookupEntry: (kind: "suggested" | "catalog", questionKey: string) => Promise<StoredEntry | null>;
};

function eligibleMessage(message: string, context: InstantContext): string | null {
  if (!context.enabled) return "disabled";
  if (!context.published) return "not_published";
  if (message.length > MAX_INSTANT_MESSAGE_CHARS) return "too_long";
  if (hasInjectionSignal(message)) return "injection_signal";
  return null;
}

function serve(entry: StoredEntry, source: InstantSource, message: string): InstantOutcome {
  const refusal = servableFormatRefusal(entry.answer);
  if (refusal) return { hit: null, reason: `unservable_${refusal}` };
  // A message naming a number the answer does not contain is a different question than the one answered.
  if (numbersMissingFrom(message, entry.answer)) return { hit: null, reason: "number_not_in_answer" };
  return { hit: { source, answer: entry.answer, entryId: entry.id, faqId: null, sourceChunkIds: entry.sourceChunkIds, similarity: null } };
}

export async function decideLocalInstant(input: LocalInstantInput, deps: LocalInstantDeps): Promise<InstantOutcome> {
  const { message, language, isFirstTurn, context } = input;
  const refusal = eligibleMessage(message, context);
  if (refusal) return { hit: null, reason: refusal };

  // 1. Greeting -- first turn only; a "hi" mid-conversation is the AI's to read.
  if (isFirstTurn && isGreetingOnly(message)) {
    if (!hasWelcomeTemplate(language)) return { hit: null, reason: "no_welcome_template" };
    const welcome = buildWelcome(language, context.businessName, context.suggestedQuestions);
    if (!welcome) return { hit: null, reason: "no_welcome_template" };
    return {
      hit: { source: "greeting", answer: welcome, entryId: null, faqId: null, sourceChunkIds: [], similarity: null },
    };
  }

  // Later turns must stand alone: "how much is it?" depends on what came before.
  if (!isFirstTurn && !isSelfContained(message)) return { hit: null, reason: "not_self_contained" };

  const key = normalizeQuestionKey(message);

  // 2. Exact suggested question (the owner's current list only -- a removed chip is no longer served).
  const chipKeys = new Set(context.suggestedQuestions.map(normalizeQuestionKey));
  if (chipKeys.has(key)) {
    const entry = await deps.lookupEntry("suggested", key);
    if (!entry) return { hit: null, reason: "no_fresh_entry" };
    return serve(entry, "suggested", message);
  }

  // 3. Catalog question.
  if (isCatalogQuestion(message)) {
    const entry = await deps.lookupEntry("catalog", CATALOG_ENTRY_KEY);
    if (!entry) return { hit: null, reason: "no_fresh_entry" };
    return serve(entry, "catalog", message);
  }

  return { hit: null, reason: "no_local_match" };
}

export type FaqCandidate = { faqId: string; question: string; answer: string; similarity: number };

export type FaqInstantInput = {
  message: string;
  isFirstTurn: boolean;
  context: InstantContext;
};

export type FaqInstantDeps = {
  /** Top matches by similarity, best first (the caller asks for two). Tenant-scoped, published only. */
  matchFaqs: () => Promise<FaqCandidate[]>;
  /** The business's product/service names, for the "names an item that is not in the answer" guard. Called only for a candidate that cleared the thresholds. */
  loadCatalogNames: () => Promise<string[]>;
};

/** Whether the FAQ phase should even be attempted -- checked before paying for the match. */
export function faqPhaseEligible(input: FaqInstantInput): string | null {
  const refusal = eligibleMessage(input.message, input.context);
  if (refusal) return refusal;
  if (!isSelfContained(input.message)) return "not_self_contained";
  if (tokenize(input.message).length < 2) return "too_short";
  return null;
}

export async function decideFaqInstant(input: FaqInstantInput, deps: FaqInstantDeps): Promise<InstantOutcome> {
  const refusal = faqPhaseEligible(input);
  if (refusal) return { hit: null, reason: refusal };

  const candidates = await deps.matchFaqs();
  const best = candidates[0];
  if (!best) return { hit: null, reason: "no_faq_candidates" };
  if (best.similarity < FAQ_MIN_SIMILARITY) return { hit: null, reason: "below_similarity_threshold" };
  const second = candidates[1];
  if (second && best.similarity - second.similarity < FAQ_MIN_GAP) return { hit: null, reason: "ambiguous_between_faqs" };

  if (!scriptsCompatible(input.message, `${best.question} ${best.answer}`)) return { hit: null, reason: "language_mismatch" };
  const formatRefusal = servableFormatRefusal(best.answer);
  if (formatRefusal) return { hit: null, reason: `unservable_${formatRefusal}` };

  const names = await deps.loadCatalogNames();
  const guard = faqGuardRefusal(input.message, `${best.question} ${best.answer}`, names);
  if (guard) return { hit: null, reason: guard };

  return {
    hit: {
      source: "faq",
      answer: best.answer,
      entryId: null,
      faqId: best.faqId,
      sourceChunkIds: [],
      similarity: best.similarity,
    },
  };
}
