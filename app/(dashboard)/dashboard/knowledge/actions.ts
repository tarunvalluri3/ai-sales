"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import {
  createKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
} from "@/lib/knowledge";
import { knowledgeTitleSchema, knowledgeContentSchema } from "@/lib/schemas/knowledge";
import { logAndGetUserMessage } from "@/lib/errors";

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

  revalidatePath("/dashboard/knowledge");
  redirect("/dashboard/knowledge");
}

export async function deleteKnowledgeDocumentAction(
  _prevState: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  const { businessId } = await requireBusinessContext();

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

  revalidatePath("/dashboard/knowledge");
  return { success: true };
}
