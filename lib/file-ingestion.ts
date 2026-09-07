import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enqueueIngestion } from "@/lib/knowledge";
import { knowledgeContentSchema } from "@/lib/schemas/knowledge";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import type { KnowledgeDocument } from "@/lib/supabase/types";

/**
 * Text-based files (.txt, .md) plus PDF (Phase B2, STATE.md's "AI sales
 * agent, not chatbot" -- PDF catalog upload). PDF text extraction uses
 * `unpdf`'s serverless-safe build (no `canvas`/native dependency needed
 * for text alone -- see lib/pdf-page-images.ts for the *page-image*
 * rendering step, which does need one, is best-effort, and is only used
 * later at publish time, not here). DOCX remains unsupported -- no
 * parsing dependency for it exists in this project.
 */
const ACCEPTED_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown", "application/pdf"]);
const MAX_TEXT_FILE_BYTES = 500_000;
/** PDFs carry embedded images/formatting overhead a plain-text file doesn't -- a larger cap than MAX_TEXT_FILE_BYTES, still bounded. */
const MAX_PDF_FILE_BYTES = 15_000_000;
/**
 * Matches `knowledgeContentSchema`'s own max and `lib/url-ingestion.ts`'s
 * identical constant -- extracted text is truncated to this before
 * validation (2026-09-08 harden pass), not passed straight to
 * `knowledgeContentSchema.parse()` unguarded. A real PDF catalog
 * routinely extracts to well over 20,000 characters even though it's
 * nowhere near the 15 MB *file* size limit above -- the previous
 * unguarded `.parse()` threw an uncaught `ZodError` for any such file,
 * surfacing only as a generic, misleading "Something went wrong. Please
 * try again," on a file that will never succeed no matter how many times
 * the user retries it.
 */
const MAX_CONTENT_LENGTH = 20_000;

export class UnsupportedFileError extends Error {}

function isPdf(file: File): boolean {
  return file.type === "application/pdf";
}

/**
 * Extracts plain text from a PDF via `unpdf`'s `extractText` (its
 * default serverless-safe build -- no `canvas`/native dependency
 * required for text extraction alone). This is what actually gets
 * chunked/embedded for RAG, same as any other file source -- catalog
 * *image* extraction (Phase B2) is a separate, later, best-effort step
 * at publish time (lib/knowledge-extraction.ts), not this one.
 */
async function extractPdfText(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

/**
 * Creates a knowledge document from an uploaded file (Phase 24 for
 * .txt/.md, Phase B2 for PDF): extracts its text, inserts the document
 * row (draft, same approval-step convention as every manual document),
 * then best-effort uploads the original file to Supabase Storage. A
 * storage upload failure does not fail the whole operation -- the
 * extracted content is already saved and is what actually gets
 * chunked/embedded; the original file is a convenience artifact for
 * text sources, but is load-bearing for a PDF's later catalog-image
 * extraction step (a failed upload there just means that later step
 * falls back to text-only extraction, no images -- see
 * lib/knowledge-extraction.ts).
 */
export async function createFileKnowledgeDocument(businessId: string, file: File): Promise<KnowledgeDocument> {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    throw new UnsupportedFileError("Only .txt, .md, and .pdf files are supported right now.");
  }

  const pdf = isPdf(file);
  if (pdf && file.size > MAX_PDF_FILE_BYTES) {
    throw new UnsupportedFileError("This PDF is too large (15 MB limit).");
  }
  if (!pdf && file.size > MAX_TEXT_FILE_BYTES) {
    throw new UnsupportedFileError("This file is too large (500 KB limit).");
  }

  let rawText: string;
  if (pdf) {
    try {
      rawText = await extractPdfText(file);
    } catch (error) {
      throw new AppError(
        "Something went wrong reading this PDF. Please try a different file.",
        "createFileKnowledgeDocument PDF text extraction failed",
        error,
      );
    }
  } else {
    rawText = await file.text();
  }

  const parsed = knowledgeContentSchema.safeParse(rawText.slice(0, MAX_CONTENT_LENGTH));
  if (!parsed.success) {
    throw new AppError(
      pdf
        ? "This PDF doesn't have any extractable text -- it may be a scanned image with no text layer. Try a text-based PDF, or paste the content in manually using \"Add knowledge manually.\""
        : "This file doesn't have any readable text content.",
      "createFileKnowledgeDocument content validation failed",
      parsed.error,
    );
  }
  const content = parsed.data;
  // Every other creation path (manual, URL) validates its title through
  // `knowledgeTitleSchema` (1-200 chars) before it ever reaches the
  // database, and there's no length constraint on the column itself
  // (`title text not null`) to catch what a schema doesn't -- a file
  // upload's title came from the raw `file.name` with none of that,
  // normalized here the same way (2026-09-08 harden pass) rather than
  // trusting a client-supplied filename to already be well-formed.
  const title = file.name.trim().slice(0, 200) || "Untitled document";

  const supabase = createServerSupabaseClient();
  const { data: document, error } = await supabase
    .from("knowledge_documents")
    .insert({
      business_id: businessId,
      source_type: "file",
      source_id: null,
      title,
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
  } else if (pdf) {
    // Unlike a text file (where the original is a pure convenience
    // artifact), a PDF's later catalog-image extraction step needs the
    // stored original -- flag this specifically so it's visible why that
    // step will fall back to text-only for this document.
    logEvent("pdf_storage_upload_failed", businessId, { documentId: document.id }, "error");
  }

  await enqueueIngestion(supabase, businessId, document.id);

  return document;
}
