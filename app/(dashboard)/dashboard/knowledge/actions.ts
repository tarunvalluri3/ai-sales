"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import {
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  enqueueIngestion,
} from "@/lib/knowledge";
import { knowledgeTitleSchema, knowledgeContentSchema } from "@/lib/schemas/knowledge";
import { logAndGetUserMessage } from "@/lib/errors";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const { businessId } = await requireBusinessContext();

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
  const { businessId } = await requireBusinessContext();

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
  const { businessId, userId } = await requireBusinessContext();

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
  const { businessId } = await requireBusinessContext();

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
