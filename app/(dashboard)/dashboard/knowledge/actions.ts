"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import {
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  enqueueIngestion,
  publishKnowledgeDocument,
  unpublishKnowledgeDocument,
  getKnowledgeDocument,
} from "@/lib/knowledge";
import { knowledgeTitleSchema, knowledgeContentSchema } from "@/lib/schemas/knowledge";
import { logAndGetUserMessage } from "@/lib/errors";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createFileKnowledgeDocument } from "@/lib/file-ingestion";
import { createUrlKnowledgeDocument, refreshUrlKnowledgeDocument } from "@/lib/url-ingestion";
import { extractCatalogFromDocument } from "@/lib/knowledge-extraction";

/**
 * Kicks the background ingestion queue right after this request finishes
 * responding (Phase 23) -- `after()` keeps the serverless function alive
 * just long enough to run this, so the common case still processes within
 * seconds without making the user's own request wait on a Gemini call.
 * The daily cron (app/api/cron/process-ingestion-queue) is only the
 * backstop for whatever this misses.
 */
function triggerIngestionProcessing(): void {
  after(() => processIngestionQueue());
}

const knowledgeFieldsSchema = z.object({
  title: knowledgeTitleSchema,
  content: knowledgeContentSchema,
});

const updateKnowledgeSchema = knowledgeFieldsSchema.extend({
  id: z.string().uuid(),
});

export type KnowledgeFormState = {
  error?: string;
  success?: boolean;
};

export async function createKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = knowledgeFieldsSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid knowledge document." };
  }

  try {
    await createKnowledgeDocument(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export async function updateKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = updateKnowledgeSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid knowledge document." };
  }

  const { id, ...input } = parsed.data;

  let updated: boolean;
  try {
    updated = await updateKnowledgeDocument(businessId, id, input);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This knowledge document no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  redirect("/dashboard/knowledge");
}

export async function deleteKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteKnowledgeDocument(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This knowledge document no longer exists." };
  }

  await recordAuditLogEntry(businessId, userId, "knowledge.deleted", "knowledge_document", parsed.data.id);

  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export async function createFileKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  try {
    await createFileKnowledgeDocument(businessId, file);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

const urlFieldsSchema = z.object({
  url: z.string().trim().url("Enter a valid URL, e.g. https://example.com/page"),
  title: knowledgeTitleSchema,
  refreshIntervalHours: z.coerce.number().int().min(1).max(24 * 30).nullable(),
});

export async function createUrlKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const rawInterval = formData.get("refreshIntervalHours");
  const parsed = urlFieldsSchema.safeParse({
    url: formData.get("url"),
    title: formData.get("title"),
    refreshIntervalHours: rawInterval && rawInterval !== "" ? rawInterval : null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid URL and title." };
  }

  try {
    await createUrlKnowledgeDocument(businessId, parsed.data.url, parsed.data.title, parsed.data.refreshIntervalHours);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export async function refreshUrlKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  let refreshed: boolean;
  try {
    refreshed = await refreshUrlKnowledgeDocument(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!refreshed) {
    return { error: "This knowledge document no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export type PublishState = {
  error?: string;
  success?: boolean;
};

export async function publishKnowledgeDocumentAction(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  let result: Awaited<ReturnType<typeof publishKnowledgeDocument>>;
  try {
    result = await publishKnowledgeDocument(businessId, parsed.data.id, userId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!result.found) {
    return { error: "This knowledge document no longer exists." };
  }

  await recordAuditLogEntry(businessId, userId, "knowledge.published", "knowledge_document", parsed.data.id);

  // Stage 2 (STATE.md): only a document's first-ever publish triggers
  // catalog extraction -- a republish (e.g. after an edit) does not
  // re-extract, avoiding duplicate drafts on every edit/publish cycle.
  // "Extract now" (below) is the deliberate manual escape hatch for
  // re-running extraction later.
  if (result.isFirstPublish) {
    const title = result.title;
    const content = result.content;
    after(() => extractCatalogFromDocument(businessId, parsed.data.id, title, content));
  }

  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export type ExtractNowState = {
  error?: string;
  success?: boolean;
};

/**
 * Manual escape hatch to (re-)run catalog extraction on an already
 * published manual/file/url document -- e.g. after a URL refresh adds new
 * content, or a document published before Stage 2 shipped. Deduplication
 * against existing rows happens in `extractCatalogFromDocument` itself
 * (exact case-insensitive name/question match); this action only checks
 * that the document exists and is published, since an unpublished
 * document's content isn't yet business-approved.
 */
export async function extractNowAction(
  _prevState: ExtractNowState,
  formData: FormData,
): Promise<ExtractNowState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  const document = await getKnowledgeDocument(businessId, parsed.data.id);
  if (!document) {
    return { error: "This knowledge document no longer exists." };
  }
  if (document.status !== "published") {
    return { error: "Publish this document before extracting catalog data from it." };
  }

  const documentId = document.id;
  const title = document.title;
  const content = document.content;
  after(() => extractCatalogFromDocument(businessId, documentId, title, content));

  return { success: true };
}

export async function unpublishKnowledgeDocumentAction(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  let unpublished: boolean;
  try {
    unpublished = await unpublishKnowledgeDocument(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!unpublished) {
    return { error: "This knowledge document is not currently published." };
  }

  await recordAuditLogEntry(businessId, userId, "knowledge.unpublished", "knowledge_document", parsed.data.id);

  revalidatePath("/dashboard/knowledge");
  return { success: true };
}

export type RetryIngestionState = {
  error?: string;
  success?: boolean;
};

/**
 * Re-enqueues a dead-lettered ('failed') document -- resets its job to
 * 'pending' with a clean attempt count, same as a fresh create/update
 * would, then immediately triggers processing. Scoped to the caller's
 * own business via enqueueIngestion's own business_id filter (affects
 * zero rows for a cross-tenant or nonexistent id, same not-found
 * contract as every other mutation on this page).
 */
export async function retryIngestionAction(
  _prevState: RetryIngestionState,
  formData: FormData,
): Promise<RetryIngestionState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid knowledge document." };
  }

  let found: boolean;
  try {
    found = await enqueueIngestion(createServerSupabaseClient(), businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!found) {
    return { error: "This knowledge document no longer exists." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/knowledge");
  return { success: true };
}
