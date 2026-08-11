"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { createFaq, updateFaq, deleteFaq } from "@/lib/faqs";
import { logAndGetUserMessage } from "@/lib/errors";

const faqFieldsSchema = z.object({
  question: z.string().trim().min(1, "Enter a question.").max(300, "Question must be 300 characters or fewer."),
  answer: z.string().trim().min(1, "Enter an answer.").max(2000, "Answer must be 2000 characters or fewer."),
});

const updateFaqSchema = faqFieldsSchema.extend({
  id: z.string().uuid(),
});

export type FaqFormState = {
  error?: string;
  success?: boolean;
};

export async function createFaqAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId } = await requireBusinessContext();

  const parsed = faqFieldsSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid FAQ." };
  }

  try {
    await createFaq(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/faqs");
  return { success: true };
}

export async function updateFaqAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId } = await requireBusinessContext();

  const parsed = updateFaqSchema.safeParse({
    id: formData.get("id"),
    question: formData.get("question"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid FAQ." };
  }

  const { id, ...input } = parsed.data;

  let updated: boolean;
  try {
    updated = await updateFaq(businessId, id, input);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This FAQ no longer exists." };
  }

  revalidatePath("/dashboard/faqs");
  redirect("/dashboard/faqs");
}

export async function deleteFaqAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId } = await requireBusinessContext();

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid FAQ." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteFaq(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This FAQ no longer exists." };
  }

  revalidatePath("/dashboard/faqs");
  return { success: true };
}
