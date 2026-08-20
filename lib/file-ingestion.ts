import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enqueueIngestion } from "@/lib/knowledge";
import { knowledgeContentSchema } from "@/lib/schemas/knowledge";
import { AppError } from "@/lib/errors";
import type { KnowledgeDocument } from "@/lib/supabase/types";

/**
 * Text-based files only (.txt, .md) -- Phase 24 scope. PDF/DOCX would
 * need a parsing dependency this phase doesn't introduce (AGENTS.md: add
 * a dependency only when the current phase genuinely needs it); this is
 * a known, documented limitation (STATE.md), not a silently missing
 * feature. Both content types the platform reasonably serves for
 * .txt/.md uploads (browsers vary on the exact string for Markdown).
 */
const ACCEPTED_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const MAX_FILE_BYTES = 500_000;

export class UnsupportedFileError extends Error {}

/**
 * Creates a knowledge document from an uploaded text file (Phase 24):
 * extracts its text directly (no separate parsing step for plain
 * text/markdown), inserts the document row (draft, same approval-step
 * convention as every manual document), then best-effort uploads the
 * original file to Supabase Storage for reference. A storage upload
 * failure does not fail the whole operation -- the extracted content is
 * already saved and is what actually gets chunked/embedded; the
 * original file is a convenience artifact, not load-bearing.
 */
export async function createFileKnowledgeDocument(businessId: string, file: File): Promise<KnowledgeDocument> {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    throw new UnsupportedFileError("Only .txt and .md files are supported right now.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UnsupportedFileError("This file is too large (500 KB limit).");
  }

  const rawText = await file.text();
  const content = knowledgeContentSchema.parse(rawText);

  const supabase = createServerSupabaseClient();
  const { data: document, error } = await supabase
    .from("knowledge_documents")
    .insert({
      business_id: businessId,
      source_type: "file",
      source_id: null,
      title: file.name,
      content,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving this knowledge document. Please try again.",
      "createFileKnowledgeDocument insert failed",
      error,
    );
  }

  const storagePath = `${businessId}/${document.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from("knowledge-files").upload(storagePath, file, {
    contentType: file.type,
  });

  if (!uploadError) {
    await supabase.from("knowledge_documents").update({ storage_path: storagePath }).eq("id", document.id);
  }

  await enqueueIngestion(supabase, businessId, document.id);

  return document;
}
