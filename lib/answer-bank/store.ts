import "server-only";
import { createHash } from "node:crypto";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";
import { loadOfferings } from "@/lib/tools/list-offerings";
import { logEvent } from "@/lib/logger";
import type { FaqCandidate, StoredEntry } from "@/lib/answer-bank/decision";
import { MAX_INSTANT_MESSAGE_CHARS, normalizeQuestionKey } from "@/lib/answer-bank/normalize";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * The fresh, published stored answer for an exact question key, or null.
 * Freshness (`content_version = businesses.answer_bank_version`) and the
 * published check are enforced inside get_instant_answer() itself, in the same
 * statement as the read -- there is no application-side cache that could
 * outlive a price edit. A lookup error is a miss: the AI answers.
 */
export async function lookupStoredEntry(
  supabase: SupabaseClient,
  businessId: string,
  kind: "suggested" | "catalog",
  questionKey: string,
  language: string,
): Promise<StoredEntry | null> {
  const { data, error } = await supabase.rpc("get_instant_answer", {
    p_business_id: businessId,
    p_kind: kind,
    p_question_key: questionKey,
    p_language: language,
  });
  if (error) {
    logEvent("answer_bank_lookup_failed", businessId, { kind }, "error");
    return null;
  }
  const row = data?.[0];
  if (!row || !row.answer) return null;
  return { id: row.id, answer: row.answer, sourceChunkIds: row.source_chunk_ids ?? [] };
}

/** The two best-matching approved FAQ questions of this business for a query embedding. Tenant-filtered in SQL. A failure is "no candidates". */
export async function matchFaqCandidates(
  supabase: SupabaseClient,
  businessId: string,
  queryEmbedding: number[],
): Promise<FaqCandidate[]> {
  const { data, error } = await supabase.rpc("match_faq_questions", {
    p_business_id: businessId,
    p_query_embedding: queryEmbedding,
    p_match_count: 2,
  });
  if (error) {
    logEvent("answer_bank_faq_match_failed", businessId, {}, "error");
    return [];
  }
  return ((data ?? []) as { faq_id: string; question: string; answer: string; similarity: number }[]).map((row) => ({
    faqId: row.faq_id,
    question: row.question,
    answer: row.answer,
    similarity: row.similarity,
  }));
}

/** Product and service names for the "message names an item the answer does not contain" guard. Empty on error (the other guards still apply). */
export async function loadCatalogNames(supabase: SupabaseClient, businessId: string): Promise<string[]> {
  try {
    const offerings = await loadOfferings(supabase, businessId);
    return (offerings ?? []).map((offering) => offering.name);
  } catch {
    return [];
  }
}

const QUERY_EMBEDDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function queryHash(businessId: string, message: string): string {
  return createHash("sha256").update(`${businessId}:${normalizeQuestionKey(message)}`).digest("hex");
}

/** PostgREST returns a pgvector column as its text form, "[0.1,0.2,...]". */
function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.every((n) => typeof n === "number") ? (value as number[]) : null;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number") ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/**
 * The query embedding for a message, reusing a stored one when the same
 * normalized question was embedded for this business before (skips the
 * ~380ms Gemini call). Returns the embedding and, on a miss, a `store`
 * callback the caller runs in `after()` so the write never delays a reply.
 * Any cache problem degrades to a plain embedText() -- the cache can only
 * save work, never change an answer: the stored vector is the embedding of an
 * earlier message with the same normalized text.
 */
export async function embedQueryWithCache(
  supabase: SupabaseClient,
  businessId: string,
  message: string,
): Promise<{ embedding: number[]; fromCache: boolean; store: (() => Promise<void>) | null }> {
  if (message.length > MAX_INSTANT_MESSAGE_CHARS) {
    return { embedding: await embedText(message), fromCache: false, store: null };
  }
  const hash = queryHash(businessId, message);
  try {
    const { data } = await supabase
      .from("query_embedding_cache")
      .select("embedding")
      .eq("business_id", businessId)
      .eq("question_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    const cached = data ? parseVector(data.embedding) : null;
    if (cached) return { embedding: cached, fromCache: true, store: null };
  } catch {
    // fall through to a real embedding
  }
  const embedding = await embedText(message);
  const store = async () => {
    try {
      const { error } = await supabase.from("query_embedding_cache").upsert(
        {
          business_id: businessId,
          question_hash: hash,
          embedding: embedding as unknown as string,
          expires_at: new Date(Date.now() + QUERY_EMBEDDING_TTL_MS).toISOString(),
        },
        { onConflict: "business_id,question_hash" },
      );
      if (error) logEvent("query_embedding_cache_write_failed", businessId, {}, "error");
    } catch {
      logEvent("query_embedding_cache_write_failed", businessId, {}, "error");
    }
  };
  return { embedding, fromCache: false, store };
}
