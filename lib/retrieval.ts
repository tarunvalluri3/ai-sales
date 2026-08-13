import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { embedText } from "@/lib/embeddings";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type KnowledgeSearchResult = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
};

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
 */
export async function searchKnowledgeChunks(
  supabase: SupabaseClient,
  businessId: string,
  queryText: string,
  limit = 5,
): Promise<KnowledgeSearchResult[]> {
  const queryEmbedding = await embedText(queryText);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_business_id: businessId,
    p_query_embedding: queryEmbedding,
    p_match_count: limit,
  });

  if (error) {
    throw new AppError(
      "Something went wrong searching your knowledge base. Please try again.",
      "searchKnowledgeChunks failed",
      error,
    );
  }

  return data;
}
