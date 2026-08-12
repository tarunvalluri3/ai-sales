import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { embedText } from "@/lib/embeddings";

export type KnowledgeSearchResult = {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
};

/**
 * Tenant-scoped similarity search over a business's knowledge chunks.
 * `businessId` must come from `requireBusinessContext()` -- never from
 * client input (docs/security.md §9). Returns an empty array, not an
 * error, for a business with no matching (or no) knowledge chunks.
 */
export async function searchKnowledgeChunks(
  businessId: string,
  queryText: string,
  limit = 5,
): Promise<KnowledgeSearchResult[]> {
  const queryEmbedding = await embedText(queryText);

  const supabase = createServerSupabaseClient();
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
