import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { embedTexts } from "@/lib/embeddings";
import { generateBankAnswer, type BusinessProfileContext } from "@/lib/rag";
import { loadOfferings } from "@/lib/tools/list-offerings";
import { logEvent } from "@/lib/logger";
import type { WidgetLanguage } from "@/lib/supabase/types";
import { CATALOG_ENTRY_KEY, CATALOG_ENTRY_TEXT, buildCatalogAnswer } from "@/lib/answer-bank/catalog";
import { normalizeQuestionKey, tokenize } from "@/lib/answer-bank/normalize";
import { findUngroundedFacts } from "@/lib/answer-bank/output-check";

type SupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Offline generation and refresh of stored answers. Runs as a background job
 * (after() on a change, the daily cron, the dashboard's refresh button) --
 * never inside a visitor's request. Service-role client: every query below
 * carries an explicit business_id filter, which is the tenant boundary.
 */

const MAX_ATTEMPTS = 5;
const LOCK_TTL_MS = 5 * 60 * 1000;
const GENERATION_CONCURRENCY = 3;
const EMBED_BATCH = 50;
const MAX_SUGGESTED = 6;

type BusinessRow = {
  id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  widget_language: WidgetLanguage;
  widget_suggested_questions: string[] | null;
  published_at: string | null;
  answer_bank_version: number | string;
};

type EntryRow = {
  id: string;
  kind: "suggested" | "catalog";
  question_key: string;
  question_text: string;
  language: string;
  answer: string | null;
  status: "pending" | "ready" | "failed";
  owner_state: "generated" | "approved" | "edited";
  content_version: number | string;
};

const BUSINESS_COLUMNS =
  "id, name, description, contact_email, contact_phone, website, widget_language, widget_suggested_questions, published_at, answer_bank_version";

async function loadBusiness(supabase: SupabaseClient, businessId: string): Promise<BusinessRow | null> {
  const { data } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).maybeSingle();
  return (data as BusinessRow | null) ?? null;
}

function profileOf(business: BusinessRow): BusinessProfileContext {
  return {
    description: business.description,
    contactEmail: business.contact_email,
    contactPhone: business.contact_phone,
    website: business.website,
  };
}

function profileText(business: BusinessRow): string {
  return [business.name, business.description, business.contact_email, business.contact_phone, business.website]
    .filter(Boolean)
    .join("\n");
}

/** Embeds every approved FAQ question that has no current embedding. Idempotent; a changed question is re-embedded (the match function also refuses an embedding whose text no longer equals the live question). */
async function syncFaqEmbeddings(supabase: SupabaseClient, businessId: string): Promise<number> {
  const [{ data: faqs }, { data: existing }] = await Promise.all([
    supabase.from("faqs").select("id, question").eq("business_id", businessId).eq("status", "approved"),
    supabase.from("faq_question_embeddings").select("faq_id, question_text").eq("business_id", businessId),
  ]);
  const current = new Map<string, string>((existing ?? []).map((row: { faq_id: string; question_text: string }) => [row.faq_id, row.question_text]));
  const todo = (faqs ?? []).filter((faq: { id: string; question: string }) => current.get(faq.id) !== faq.question);
  let written = 0;
  for (let start = 0; start < todo.length; start += EMBED_BATCH) {
    const batch = todo.slice(start, start + EMBED_BATCH) as { id: string; question: string }[];
    const embeddings = await embedTexts(
      batch.map((faq) => faq.question),
      { feature: "answer_bank", trigger: "cron", businessId },
    );
    const { error } = await supabase.from("faq_question_embeddings").upsert(
      batch.map((faq, index) => ({
        faq_id: faq.id,
        business_id: businessId,
        question_text: faq.question,
        embedding: embeddings[index] as unknown as string,
      })),
      { onConflict: "faq_id" },
    );
    if (error) throw new Error("faq embedding upsert failed");
    written += batch.length;
  }
  return written;
}

async function upsertEntry(
  supabase: SupabaseClient,
  businessId: string,
  entry: {
    kind: "suggested" | "catalog";
    questionKey: string;
    questionText: string;
    language: string;
    answer: string | null;
    status: "ready" | "failed" | "pending";
    ownerState?: "generated" | "approved" | "edited";
    contentVersion: number;
    failureReason?: string | null;
    sourceChunkIds?: string[];
  },
): Promise<void> {
  const { error } = await supabase.from("answer_bank_entries").upsert(
    {
      business_id: businessId,
      kind: entry.kind,
      question_key: entry.questionKey,
      question_text: entry.questionText,
      language: entry.language,
      answer: entry.answer,
      status: entry.status,
      owner_state: entry.ownerState ?? "generated",
      content_version: entry.contentVersion,
      failure_reason: entry.failureReason ?? null,
      source_chunk_ids: entry.sourceChunkIds ?? [],
      generated_at: new Date().toISOString(),
      approved_at: null,
    },
    { onConflict: "business_id,kind,question_key,language" },
  );
  if (error) throw new Error("answer_bank_entries upsert failed");
}

/** Generates one suggested-question answer and applies the store-time output checks. Never throws: a failure is stored as a failed entry so the dashboard can show why. */
async function generateSuggestedEntry(
  supabase: SupabaseClient,
  business: BusinessRow,
  question: string,
  version: number,
  catalogNames: string[],
): Promise<"ready" | "failed"> {
  const language = business.widget_language;
  const questionKey = normalizeQuestionKey(question);
  const fail = async (reason: string) => {
    await upsertEntry(supabase, business.id, {
      kind: "suggested", questionKey, questionText: question, language,
      answer: null, status: "failed", contentVersion: version, failureReason: reason,
    });
    return "failed" as const;
  };

  let draft;
  try {
    draft = await generateBankAnswer(supabase, business.id, business.name, profileOf(business), question, language);
  } catch (error) {
    logEvent("answer_bank_generation_failed", business.id, { kind: "suggested" }, "error");
    void error;
    return fail("generation_error");
  }
  if (!draft.ok) return fail(draft.reason);

  const ungrounded = findUngroundedFacts(draft.answer, `${draft.contextText}\n${profileText(business)}`);
  if (ungrounded.length > 0) return fail(`ungrounded_fact: ${ungrounded.slice(0, 3).join(", ")}`);

  // A question that names a catalog item must get an answer that names it too.
  const answerTokens = ` ${tokenize(draft.answer).join(" ")} `;
  const questionTokens = ` ${tokenize(question).join(" ")} `;
  for (const name of catalogNames) {
    const needle = ` ${tokenize(name).join(" ")} `;
    if (needle.trim().length > 0 && questionTokens.includes(needle) && !answerTokens.includes(needle)) {
      return fail("answer_omits_named_item");
    }
  }

  await upsertEntry(supabase, business.id, {
    kind: "suggested", questionKey, questionText: question, language,
    answer: draft.answer, status: "ready", contentVersion: version, sourceChunkIds: draft.sourceChunkIds,
  });
  return "ready";
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(run));
  }
}

export type RefreshResult =
  | { status: "skipped"; reason: "not_found" | "not_published" }
  | { status: "done"; version: number; ready: number; failed: number; needsReview: number; stable: boolean };

/**
 * Brings every stored answer of one business up to the current content
 * version: FAQ embeddings, the catalog answer, and each suggested-question
 * answer. Answers are stamped with the version read at the START, so content
 * that changes mid-run leaves them unservable (correct) and `stable: false`
 * tells the caller to keep the job queued. An owner-EDITED answer is never
 * overwritten: when the content moved on it is parked for the owner's review.
 */
export async function refreshAnswerBank(supabase: SupabaseClient, businessId: string): Promise<RefreshResult> {
  const business = await loadBusiness(supabase, businessId);
  if (!business) return { status: "skipped", reason: "not_found" };
  if (!business.published_at) return { status: "skipped", reason: "not_published" };
  const version = Number(business.answer_bank_version);
  const language = business.widget_language;

  await syncFaqEmbeddings(supabase, businessId);

  const { data: existingRows } = await supabase
    .from("answer_bank_entries")
    .select("id, kind, question_key, question_text, language, answer, status, owner_state, content_version")
    .eq("business_id", businessId);
  const existing = new Map<string, EntryRow>(
    ((existingRows ?? []) as EntryRow[]).map((row) => [`${row.kind}|${row.question_key}|${row.language}`, row]),
  );

  let ready = 0;
  let failed = 0;
  let needsReview = 0;

  // Catalog answer: deterministic from the rows, so no model and no price to get wrong.
  const offerings = (await loadOfferings(supabase, businessId)) ?? [];
  const catalogAnswer = buildCatalogAnswer(language, business.name, offerings);
  const catalogExisting = existing.get(`catalog|${CATALOG_ENTRY_KEY}|${language}`);
  if (!catalogAnswer) {
    await supabase.from("answer_bank_entries").delete().eq("business_id", businessId).eq("kind", "catalog");
  } else if (catalogExisting?.owner_state === "edited") {
    if (Number(catalogExisting.content_version) === version && catalogExisting.status === "ready") ready++;
    else {
      await parkForReview(supabase, businessId, catalogExisting.id);
      needsReview++;
    }
  } else {
    await upsertEntry(supabase, businessId, {
      kind: "catalog", questionKey: CATALOG_ENTRY_KEY, questionText: CATALOG_ENTRY_TEXT, language,
      answer: catalogAnswer, status: "ready", contentVersion: version,
    });
    ready++;
  }

  // Suggested questions: drop entries for questions no longer on the list, (re)build the rest.
  const questions = (business.widget_suggested_questions ?? []).filter((q) => q.trim().length > 0).slice(0, MAX_SUGGESTED);
  const wanted = new Set(questions.map(normalizeQuestionKey));
  const stale = ((existingRows ?? []) as EntryRow[]).filter(
    (row) => row.kind === "suggested" && (!wanted.has(row.question_key) || row.language !== language),
  );
  if (stale.length > 0) {
    await supabase.from("answer_bank_entries").delete().eq("business_id", businessId).in("id", stale.map((row) => row.id));
  }

  const catalogNames = offerings.map((offering) => offering.name);
  const toGenerate: string[] = [];
  for (const question of questions) {
    const row = existing.get(`suggested|${normalizeQuestionKey(question)}|${language}`);
    if (row?.owner_state === "edited") {
      if (Number(row.content_version) === version && row.status === "ready") ready++;
      else {
        await parkForReview(supabase, businessId, row.id);
        needsReview++;
      }
    } else {
      toGenerate.push(question);
    }
  }
  await inBatches(toGenerate, GENERATION_CONCURRENCY, async (question) => {
    const outcome = await generateSuggestedEntry(supabase, business, question, version, catalogNames);
    if (outcome === "ready") ready++;
    else failed++;
  });

  const after = await loadBusiness(supabase, businessId);
  const stable = !!after && Number(after.answer_bank_version) === version;
  logEvent("answer_bank_refreshed", businessId, { version, ready, failed, needsReview, stable });
  return { status: "done", version, ready, failed, needsReview, stable };
}

/** An owner-edited answer whose underlying content changed: keep their text, stop serving it, ask them to review. */
async function parkForReview(supabase: SupabaseClient, businessId: string, entryId: string): Promise<void> {
  await supabase
    .from("answer_bank_entries")
    .update({ status: "pending", failure_reason: "edited_answer_needs_review" })
    .eq("business_id", businessId)
    .eq("id", entryId);
}

/**
 * Regenerates ONE entry on the owner's request, overwriting any edit (they
 * asked). Stamped with the current version. Returns the resulting status.
 */
export async function regenerateEntry(
  supabase: SupabaseClient,
  businessId: string,
  entryId: string,
): Promise<"ready" | "failed" | "not_found" | "unsupported"> {
  const business = await loadBusiness(supabase, businessId);
  if (!business) return "not_found";
  const { data } = await supabase
    .from("answer_bank_entries")
    .select("id, kind, question_key, question_text, language")
    .eq("business_id", businessId)
    .eq("id", entryId)
    .maybeSingle();
  const row = data as Pick<EntryRow, "id" | "kind" | "question_key" | "question_text" | "language"> | null;
  if (!row) return "not_found";
  const version = Number(business.answer_bank_version);

  if (row.kind === "catalog") {
    const offerings = (await loadOfferings(supabase, businessId)) ?? [];
    const answer = buildCatalogAnswer(row.language, business.name, offerings);
    if (!answer) return "unsupported";
    await upsertEntry(supabase, businessId, {
      kind: "catalog", questionKey: CATALOG_ENTRY_KEY, questionText: CATALOG_ENTRY_TEXT, language: row.language,
      answer, status: "ready", contentVersion: version,
    });
    return "ready";
  }
  const offerings = (await loadOfferings(supabase, businessId)) ?? [];
  return generateSuggestedEntry(supabase, business, row.question_text, version, offerings.map((o) => o.name));
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

async function claimJob(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data } = await supabase
    .from("answer_bank_jobs")
    .update({ locked_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .select("business_id, attempts");
  if (!data || data.length === 0) return false;
  await supabase
    .from("answer_bank_jobs")
    .update({ attempts: (data[0] as { attempts: number }).attempts + 1 })
    .eq("business_id", businessId);
  return true;
}

/**
 * Claims and runs the queued job for one business, if there is one and no one
 * else holds it. Safe to call often (a no-op without a job). The job row is
 * removed only when the content version did not move during the run;
 * otherwise it is released and a later run picks up the newer version.
 */
export async function runAnswerBankJob(businessId: string): Promise<"ran" | "no_job" | "failed"> {
  const supabase = createServiceSupabaseClient();
  if (!(await claimJob(supabase, businessId))) return "no_job";
  try {
    const result = await refreshAnswerBank(supabase, businessId);
    if (result.status === "skipped" || result.stable) {
      await supabase.from("answer_bank_jobs").delete().eq("business_id", businessId);
    } else {
      await supabase.from("answer_bank_jobs").update({ locked_at: null }).eq("business_id", businessId);
    }
    return "ran";
  } catch (error) {
    logEvent("answer_bank_job_failed", businessId, {}, "error");
    void error;
    await supabase.from("answer_bank_jobs").update({ locked_at: null }).eq("business_id", businessId);
    return "failed";
  }
}

/** For `after()`: runs the business's queued regeneration, never throws. */
export async function kickAnswerBankRefresh(businessId: string): Promise<void> {
  try {
    await runAnswerBankJob(businessId);
  } catch {
    // best effort; the daily cron is the backstop
  }
}

/** Daily cron entry: runs up to `limit` due jobs and purges expired cached query embeddings. */
export async function processAnswerBankJobs(limit = 5): Promise<{ ran: number; failed: number; purged: number }> {
  const supabase = createServiceSupabaseClient();
  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data: due } = await supabase
    .from("answer_bank_jobs")
    .select("business_id")
    .lt("attempts", MAX_ATTEMPTS)
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .order("requested_at", { ascending: true })
    .limit(limit);
  let ran = 0;
  let failed = 0;
  for (const job of (due ?? []) as { business_id: string }[]) {
    const outcome = await runAnswerBankJob(job.business_id);
    if (outcome === "ran") ran++;
    if (outcome === "failed") failed++;
  }
  const { count } = await supabase
    .from("query_embedding_cache")
    .delete({ count: "exact" })
    .lt("expires_at", new Date().toISOString());
  return { ran, failed, purged: count ?? 0 };
}

/** Queues a refresh for a business (the owner pressed "Refresh answers"). Resets attempts and any stale lock so the job can run now. */
export async function enqueueAnswerBankRefresh(businessId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("answer_bank_jobs")
    .upsert(
      { business_id: businessId, requested_at: new Date().toISOString(), attempts: 0, locked_at: null },
      { onConflict: "business_id" },
    );
  if (error) throw new Error("answer_bank_jobs enqueue failed");
}
