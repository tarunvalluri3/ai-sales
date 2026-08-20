import "server-only";
import { createHash } from "node:crypto";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Phase 23 "safe response caching for low-variance questions." Only ever
 * caches a real, previously-grounded, no-side-effect answer -- see
 * `shouldCacheResponse` for the exact conditions -- so a hit can never
 * skip a side-effecting tool call (e.g. request_callback) or serve a
 * fabricated/escalation response. 1-hour TTL: an accepted staleness
 * window for FAQ-style repeats, not knowledge-version invalidation --
 * see docs/architecture.md for the reasoning. Purged daily by
 * `delete_expired_ai_response_cache` (20260820221000).
 */
const CACHE_TTL_SECONDS = 60 * 60;

export type CachedResponse = {
  answer: string;
  usedContext: boolean;
  sourceChunkIds: string[];
};

export type CacheableResult = CachedResponse & {
  grounded: boolean;
  escalate: boolean;
};

/**
 * Only a real, grounded, non-escalating, first-turn answer with no
 * side-effecting tool call is eligible -- see the module doc comment.
 * A read-only tool call (check_product_details/check_faq_topic) does
 * NOT disqualify caching; only a side-effecting one (request_callback,
 * which writes a lead) does.
 */
export function shouldCacheResponse(
  result: CacheableResult,
  isFirstTurn: boolean,
  calledSideEffectingTool: boolean,
): boolean {
  return isFirstTurn && !calledSideEffectingTool && result.grounded && !result.escalate;
}

/** Normalizes a question to widen exact-match hits across trivial phrasing differences (whitespace/case/punctuation), without any fuzzy/semantic matching that could return a wrong-context cached answer. */
function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/g, "");
}

/** `language` is folded into the hash (Phase 25a) so a business that changes/varies its widget_language never gets a cached answer written in a different language served back. */
function hashQuestion(businessId: string, question: string, language: string): string {
  return createHash("sha256").update(`${businessId}:${language}:${normalizeQuestion(question)}`).digest("hex");
}

/** Looks up a live (not-yet-expired) cached answer for this business/question/language. Returns `null` on a miss or any lookup error -- a cache-read failure must never break a real chat response, it just skips the cache. */
export async function getCachedResponse(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  language: string,
): Promise<CachedResponse | null> {
  const { data, error } = await supabase
    .from("ai_response_cache")
    .select("answer, used_context, source_chunk_ids")
    .eq("business_id", businessId)
    .eq("question_hash", hashQuestion(businessId, question, language))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { answer: data.answer, usedContext: data.used_context, sourceChunkIds: data.source_chunk_ids };
}

/**
 * Best-effort write -- a cache-write failure must never break the real
 * chat response it's caching, so the outcome is logged (Sentry-forwarded
 * on failure, same as ai_response_metrics' write-failure convention) but
 * never thrown.
 */
export async function setCachedResponse(
  supabase: SupabaseClient,
  businessId: string,
  question: string,
  language: string,
  response: CachedResponse,
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_response_cache").upsert(
      {
        business_id: businessId,
        question_hash: hashQuestion(businessId, question, language),
        answer: response.answer,
        used_context: response.usedContext,
        source_chunk_ids: response.sourceChunkIds,
        expires_at: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
      },
      { onConflict: "business_id,question_hash" },
    );
    if (error) {
      logEvent("ai_response_cache_write_failed", businessId, {}, "error");
    }
  } catch {
    logEvent("ai_response_cache_write_failed", businessId, {}, "error");
  }
}
