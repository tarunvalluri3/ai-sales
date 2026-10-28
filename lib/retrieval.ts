import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { embedText } from "@/lib/embeddings";
import { DRAFT_SOURCE, type AgentSource } from "@/lib/agent-runtime";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type KnowledgeSearchResult = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  /** Set only by a live search (match_live_knowledge_chunks) -- the generated-document source the chunk came from. */
  source_type?: string;
  source_id?: string | null;
};

/**
 * Tenant- and version-scoped similarity search over the LIVE copy of the
 * knowledge chunks (Draft -> Publish -> Live). `versionId` pins the search to
 * the one published version the caller is serving; a chunk edited, added or
 * deleted in the draft since is simply not in it. `sourceTypes` optionally
 * narrows to generated documents (e.g. product/service for recommendations).
 */
export async function searchLiveKnowledgeChunks(
  supabase: SupabaseClient,
  businessId: string,
  versionId: string,
  queryEmbedding: number[],
  limit: number,
  sourceTypes: string[] | null = null,
): Promise<KnowledgeSearchResult[]> {
  const { data, error } = await supabase.rpc("match_live_knowledge_chunks", {
    p_business_id: businessId,
    p_version_id: versionId,
    p_query_embedding: queryEmbedding,
    p_match_count: limit,
    p_source_types: sourceTypes,
  });

  if (error) {
    throw new AppError(
      "Something went wrong searching your knowledge base. Please try again.",
      "searchLiveKnowledgeChunks failed",
      error,
    );
  }

  return data;
}

/**
 * Tenant-scoped similarity search over a business's knowledge chunks.
 * Takes the Supabase client as a parameter (rather than constructing one
 * internally) so both the Clerk-authenticated dashboard path and the
 * service-role widget path (app/api/chat/route.ts) can share this one
 * implementation -- match_knowledge_chunks only grants EXECUTE to
 * authenticated, so calling it as anon (the widget path's old,
 * internally-constructed Clerk-session client with no session) fails
 * with 42501. `businessId` must come from `requireBusinessContext()` or
 * `resolveBusinessFromWidgetKey()` -- never from client input
 * (docs/security.md §9). Returns an empty array, not an error, for a
 * business with no matching (or no) knowledge chunks.
 *
 * `onTiming` is optional instrumentation (2026-10-21): this one call is
 * two network round trips -- a Gemini embedding call and a pgvector RPC --
 * and the AI latency work needed them separated rather than summed, since
 * only one of the two is affected by which region the function runs in.
 * Callers that don't pass it behave exactly as before.
 *
 * `queryEmbeddingPromise` (2026-10-27 latency pass) is an embedding the
 * caller already started for this same `queryText` -- the chat route kicks
 * it off once the widget key is authenticated and rate-checked, so it
 * overlaps the remaining pre-AI database work. It only replaces the embed
 * call; the tenant-scoped `match_knowledge_chunks` query is unchanged, and a
 * rejection surfaces here exactly as one from `embedText()` would.
 *
 * `source` (Draft -> Publish -> Live): `draft` (the default) searches the
 * editing tables' chunks -- the dashboard's "Testing draft" chat. A `live`
 * source searches only that published version's chunk copy; the prospect-
 * facing channels always pass one.
 */
export async function searchKnowledgeChunks(
  supabase: SupabaseClient,
  businessId: string,
  queryText: string,
  limit = 5,
  onTiming?: (timings: { embedMs: number; searchMs: number }) => void,
  queryEmbeddingPromise?: Promise<number[]>,
  source: AgentSource = DRAFT_SOURCE,
): Promise<KnowledgeSearchResult[]> {
  const embedStartedAt = Date.now();
  const queryEmbedding = await (queryEmbeddingPromise ?? embedText(queryText));
  const embedMs = Date.now() - embedStartedAt;

  if (source.kind === "live") {
    const searchStartedAt = Date.now();
    try {
      return await searchLiveKnowledgeChunks(supabase, businessId, source.versionId, queryEmbedding, limit);
    } finally {
      onTiming?.({ embedMs, searchMs: Date.now() - searchStartedAt });
    }
  }

  const searchStartedAt = Date.now();
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_business_id: businessId,
    p_query_embedding: queryEmbedding,
    p_match_count: limit,
  });
  // Reported before the error check below, so a failed search still
  // reports how long it took to fail.
  onTiming?.({ embedMs, searchMs: Date.now() - searchStartedAt });

  if (error) {
    throw new AppError(
      "Something went wrong searching your knowledge base. Please try again.",
      "searchKnowledgeChunks failed",
      error,
    );
  }

  return data;
}
