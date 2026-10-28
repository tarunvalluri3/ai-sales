"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createFaq, updateFaq, deleteFaq, approveFaqDraft, rejectFaqDraft } from "@/lib/faqs";
import { logAndGetUserMessage } from "@/lib/errors";
import { processIngestionQueue } from "@/lib/ingestion-queue";

/**
 * Mirrors dashboard/knowledge/actions.ts's own triggerIngestionProcessing():
 * create/update/approve here all call lib/knowledge-sync.ts's
 * syncGeneratedDocument(), which enqueues the FAQ's generated knowledge
 * document the exact same way a knowledge document is enqueued -- but
 * unlike the knowledge actions, this file never kicked the immediate
 * after() processor, only relying on the daily cron backstop (which Vercel's
 * Hobby plan caps at once a day). A new FAQ's embedding could silently take
 * up to 24h to become retrieval-ready. Found live via the onboarding
 * wizard's FAQ step staying stuck on "processing" indefinitely (2026-10-29
 * bugfix, STATE.md); the same gap existed in products/actions.ts and
 * services/actions.ts and is fixed there too.
 */
function triggerIngestionProcessing(): void {
  after(() => processIngestionQueue("dashboard"));
}

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
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

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

  triggerIngestionProcessing();
  revalidatePath("/dashboard/faqs");
  return { success: true };
}

export async function updateFaqAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

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

  triggerIngestionProcessing();
  revalidatePath("/dashboard/faqs");
  redirect("/dashboard/faqs");
}

/**
 * Same update as `updateFaqAction`, minus the `redirect()`. That action's
 * redirect is correct for its one existing caller (the standalone
 * `/dashboard/faqs/[id]/edit` page), but the onboarding wizard edits an
 * FAQ inline, in place, without navigating anywhere -- a `redirect()`
 * there would bounce the user straight into the dashboard's pre-publish
 * guard (2026-10-29 bugfix, STATE.md). Kept as a separate export rather
 * than branching the existing one, so that action's one real caller is
 * untouched.
 */
export async function updateFaqInPlaceAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

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

  triggerIngestionProcessing();
  revalidatePath("/dashboard/faqs");
  revalidatePath("/onboarding");
  return { success: true };
}

export async function deleteFaqAction(
  _prevState: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

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

export type ReviewState = {
  error?: string;
  success?: boolean;
};

/** Approves an FAQ extracted from a knowledge document (Stage 2, STATE.md). */
export async function approveFaqAction(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid FAQ." };
  }

  let approved: boolean;
  try {
    approved = await approveFaqDraft(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!approved) {
    return { error: "This FAQ is no longer awaiting review." };
  }

  triggerIngestionProcessing();
  revalidatePath("/dashboard/faqs");
  return { success: true };
}

/** Rejects (deletes) an FAQ extracted from a knowledge document (Stage 2, STATE.md). */
export async function rejectFaqAction(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:member");
  if (authError) {
    return { error: authError };
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: "Invalid FAQ." };
  }

  let rejected: boolean;
  try {
    rejected = await rejectFaqDraft(businessId, parsed.data.id);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!rejected) {
    return { error: "This FAQ is no longer awaiting review." };
  }

  revalidatePath("/dashboard/faqs");
  return { success: true };
}
