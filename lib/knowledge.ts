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
    .in("source_type", ["manual", "file", "url"])
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
    .in("source_type", ["manual", "file", "url"])
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
    .insert({ business_id: businessId, source_type: "manual", source_id: null, status: "draft", ...input })
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
    .in("source_type", ["manual", "file", "url"])
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
    .in("source_type", ["manual", "file", "url"])
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

export type PublishKnowledgeDocumentResult = {
  found: boolean;
  /** True if `document.version` was still 1 at the moment this was called -- i.e. this is the document's first-ever publish, not a republish. Stage 2's extraction trigger (dashboard/knowledge/actions.ts) fires only on this. */
  isFirstPublish: boolean;
  title: string;
  content: string;
  /** Phase B2 (STATE.md): non-null only for a file-sourced document whose original upload was stored (lib/file-ingestion.ts) -- lets the publish trigger pick the PDF-image extraction path over the text-only one when this is a PDF. */
  storagePath: string | null;
};

/**
 * Publishes a draft (or republishes a previously unpublished) manual
 * knowledge document -- the approval step gating whether its chunks are
 * ever eligible for retrieval (match_knowledge_chunks joins knowledge_documents
 * and filters status = 'published'). Snapshots the current title/content
 * into knowledge_document_versions as an immutable history row before
 * flipping status, and bumps `version`. `actorUserId` must come from
 * `requireBusinessContext()`. `found: false` for a cross-tenant,
 * nonexistent, or non-manual id, same not-found contract as every other
 * mutation in this file.
 */
export async function publishKnowledgeDocument(
  businessId: string,
  id: string,
  actorUserId: string,
): Promise<PublishKnowledgeDocumentResult> {
  const supabase = createServerSupabaseClient();

  const { data: document, error: fetchError } = await supabase
    .from("knowledge_documents")
    .select("id, title, content, version, storage_path")
    .eq("business_id", businessId)
    .eq("id", id)
    .in("source_type", ["manual", "file", "url"])
    .maybeSingle();

  if (fetchError || !document) {
    return { found: false, isFirstPublish: false, title: "", content: "", storagePath: null };
  }

  const isFirstPublish = document.version === 1;
  const nextVersion = document.version + 1;
  const now = new Date().toISOString();

  const { error: versionError } = await supabase.from("knowledge_document_versions").insert({
    document_id: document.id,
    business_id: businessId,
    version: nextVersion,
    title: document.title,
    content: document.content,
    published_by: actorUserId,
    published_at: now,
  });

  if (versionError) {
    throw new AppError(
      "Something went wrong publishing this knowledge document. Please try again.",
      "publishKnowledgeDocument version insert failed",
      versionError,
    );
  }

  const { error: updateError } = await supabase
    .from("knowledge_documents")
    .update({ status: "published", version: nextVersion, published_at: now })
    .eq("business_id", businessId)
    .eq("id", id);

  if (updateError) {
    throw new AppError(
      "Something went wrong publishing this knowledge document. Please try again.",
      "publishKnowledgeDocument status update failed",
      updateError,
    );
  }

  return {
    found: true,
    isFirstPublish,
    title: document.title,
    content: document.content,
    storagePath: document.storage_path,
  };
}

/** Takes a published manual document back to draft -- its chunks immediately stop being retrieval-eligible, without deleting them (a re-publish needs no re-ingestion). See `publishKnowledgeDocument` for the not-found contract. */
export async function unpublishKnowledgeDocument(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({ status: "draft" })
    .eq("business_id", businessId)
    .eq("id", id)
    .in("source_type", ["manual", "file", "url"])
    .eq("status", "published")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong unpublishing this knowledge document. Please try again.",
      "unpublishKnowledgeDocument failed",
      error,
    );
  }

  return data.length > 0;
}

/**
 * Resolves `{ id -> title }` for a set of knowledge document ids, scoped to
 * the given business -- used by the products/services/FAQs "Pending
 * review" sections (Stage 2, STATE.md) to show which document an extracted
 * draft came from. Business-scoped like every other lookup here, so an id
 * from another business simply resolves to nothing.
 */
export async function getKnowledgeDocumentTitles(
  businessId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, title")
    .eq("business_id", businessId)
    .in("id", ids);

  if (error || !data) {
    return new Map();
  }

  return new Map(data.map((document) => [document.id, document.title]));
}

export type CitedChunk = {
  id: string;
  content: string;
  documentTitle: string;
};

/**
 * Resolves citation details (chunk content + parent document title) for
 * the chunk IDs an assistant message cited (Phase 24, `messages.source_chunk_ids`).
 * Deliberately business-scoped like every other lookup here -- a chunk ID
 * from another business's data would simply return nothing, never leak
 * cross-tenant content. Silently drops any ID that no longer resolves
 * (the source document/chunk was edited or deleted since the message was
 * sent -- regenerateChunksForDocument is delete-and-reinsert by design)
 * rather than erroring, since a stale citation is expected, not a bug.
 */
export async function getCitationDetails(businessId: string, chunkIds: string[]): Promise<CitedChunk[]> {
  if (chunkIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data: chunks, error: chunksError } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, content")
    .eq("business_id", businessId)
    .in("id", chunkIds);

  if (chunksError || !chunks || chunks.length === 0) {
    return [];
  }

  const documentIds = [...new Set(chunks.map((chunk) => chunk.document_id))];
  const { data: documents } = await supabase
    .from("knowledge_documents")
    .select("id, title")
    .eq("business_id", businessId)
    .in("id", documentIds);

  const titleByDocumentId = new Map((documents ?? []).map((document) => [document.id, document.title]));

  return chunks.map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    documentTitle: titleByDocumentId.get(chunk.document_id) ?? "Untitled",
  }));
}

export type { KnowledgeSourceType };
