import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeSourceType } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { chunkText } from "@/lib/chunking";
import { embedTexts } from "@/lib/embeddings";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type KnowledgeDocumentInput = {
  title: string;
  content: string;
};

/** Looks up a single manual knowledge document, scoped to the given business. `null` if it doesn't exist or belongs to another business. */
export async function getKnowledgeDocument(
  businessId: string,
  id: string,
): Promise<KnowledgeDocument | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source_type", "manual")
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this knowledge document. Please try again.",
      "getKnowledgeDocument failed",
      error,
    );
  }

  return data;
}

/** Lists all manually authored knowledge documents for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listKnowledgeDocumentsForBusiness(
  businessId: string,
): Promise<KnowledgeDocument[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("business_id", businessId)
    .eq("source_type", "manual")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your knowledge documents. Please try again.",
      "listKnowledgeDocumentsForBusiness failed",
      error,
    );
  }

  return data;
}

/** Creates a manual knowledge document for a business and chunks its content. `businessId` must come from `requireBusinessContext()`. */
export async function createKnowledgeDocument(
  businessId: string,
  input: KnowledgeDocumentInput,
): Promise<KnowledgeDocument> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({ business_id: businessId, source_type: "manual", source_id: null, ...input })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this knowledge document. Please try again.",
      "createKnowledgeDocument failed",
      error,
    );
  }

  await enqueueIngestion(supabase, businessId, data.id);

  return data;
}

/**
 * Updates a manual knowledge document and regenerates its chunks, scoped
 * to the given business. `id`s belonging to another business (or
 * nonexistent) affect zero rows -- returns `false` rather than throwing,
 * so the caller can show a safe "not found" message without
 * distinguishing that from a cross-tenant attempt.
 */
export async function updateKnowledgeDocument(
  businessId: string,
  id: string,
  input: KnowledgeDocumentInput,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update(input)
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source_type", "manual")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this knowledge document. Please try again.",
      "updateKnowledgeDocument failed",
      error,
    );
  }

  if (data.length === 0) {
    return false;
  }

  await enqueueIngestion(supabase, businessId, id);

  return true;
}

/** Deletes a manual knowledge document (and its chunks, via cascade), scoped to the given business. See `updateKnowledgeDocument` for the not-found contract. */
export async function deleteKnowledgeDocument(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source_type", "manual")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting this knowledge document. Please try again.",
      "deleteKnowledgeDocument failed",
      error,
    );
  }

  return data.length > 0;
}

/** Lists chunks for a knowledge document, scoped to the given business, ordered by position. */
export async function listChunksForDocument(
  businessId: string,
  documentId: string,
): Promise<KnowledgeChunk[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading this document's chunks. Please try again.",
      "listChunksForDocument failed",
      error,
    );
  }

  return data;
}

/**
 * Deletes all existing chunks for a document and reinserts freshly
 * chunked content. Delete-and-reinsert, not an incremental diff -- nothing
 * depends on stable chunk IDs across edits (no chunk-level references),
 * and delete-then-insert is what makes re-running ingestion on the same
 * document idempotent (Phase 23's exit criterion) -- a second run
 * produces the same final chunk set, never duplicates.
 *
 * Takes the Supabase client as a parameter, not constructed internally,
 * so `lib/ingestion-queue.ts`'s background processor (service-role
 * client, no Clerk session) can call this the same way the pre-Phase-23
 * request path did (authenticated client) -- same pattern as
 * `lib/retrieval.ts`'s `searchKnowledgeChunks`. As of Phase 23 this is
 * only ever called from the queue processor, never directly from the
 * request path -- see `enqueueIngestion` for what create/update call
 * instead.
 */
export async function regenerateChunksForDocument(
  supabase: SupabaseClient,
  businessId: string,
  documentId: string,
  content: string,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("business_id", businessId)
    .eq("document_id", documentId);

  if (deleteError) {
    throw new AppError(
      "Something went wrong updating this document's knowledge chunks. Please try again.",
      "regenerateChunksForDocument delete failed",
      deleteError,
    );
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    return;
  }

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  const { error: insertError } = await supabase.from("knowledge_chunks").insert(
    chunks.map((chunk, index) => ({
      business_id: businessId,
      document_id: documentId,
      chunk_index: chunk.index,
      content: chunk.content,
      char_count: chunk.charCount,
      embedding: embeddings[index],
    })),
  );

  if (insertError) {
    throw new AppError(
      "Something went wrong updating this document's knowledge chunks. Please try again.",
      "regenerateChunksForDocument insert failed",
      insertError,
    );
  }
}

/**
 * Marks a document as due for (re)ingestion -- resets it to a fresh
 * 'pending' job (attempts/backoff/error all cleared) so the background
 * queue (`lib/ingestion-queue.ts`) picks it up. This is the only thing
 * create/update do synchronously for chunking/embedding as of Phase 23;
 * the actual Gemini embedding call happens later, off the request path.
 * Idempotent to call repeatedly (e.g. two quick edits in a row just
 * re-resets the same row's job, never creates a duplicate). Returns
 * whether a row was actually found and updated -- `false` for a
 * cross-tenant or nonexistent id, same not-found contract as
 * `updateKnowledgeDocument`/`deleteKnowledgeDocument`.
 */
export async function enqueueIngestion(
  supabase: SupabaseClient,
  businessId: string,
  documentId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({
      ingestion_status: "pending",
      ingestion_attempts: 0,
      ingestion_last_error: null,
      ingestion_next_attempt_at: now,
      ingestion_updated_at: now,
    })
    .eq("business_id", businessId)
    .eq("id", documentId)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong queuing this document for processing. Please try again.",
      "enqueueIngestion failed",
      error,
    );
  }

  return data.length > 0;
}

export type { KnowledgeSourceType };
