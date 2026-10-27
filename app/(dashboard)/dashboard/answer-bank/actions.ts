"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { approveAnswer, saveEditedAnswer, type EntryEditResult } from "@/lib/answer-bank/dashboard";
import { enqueueAnswerBankRefresh, regenerateEntry, runAnswerBankJob } from "@/lib/answer-bank/generate";
import { logAndGetUserMessage } from "@/lib/errors";

const PAGE = "/dashboard/answer-bank";
const entryIdSchema = z.object({ id: z.string().uuid() });

/** Result codes travel in the query string and are mapped to fixed text by the page -- no user-supplied text is ever reflected. */
function back(notice: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=${notice}`);
}

function editNotice(result: EntryEditResult): string {
  switch (result) {
    case "ok":
      return "saved";
    case "not_found":
      return "missing";
    case "not_approvable":
      return "not-approvable";
    default:
      return "invalid";
  }
}

export async function saveEditedAnswerAction(formData: FormData): Promise<void> {
  const { businessId, orgRole } = await requireBusinessContext();
  if (requireMinRole(orgRole, "org:member")) back("forbidden");
  const parsed = entryIdSchema.safeParse({ id: formData.get("id") });
  const answer = formData.get("answer");
  if (!parsed.success || typeof answer !== "string") back("invalid");
  let result: EntryEditResult;
  try {
    result = await saveEditedAnswer(businessId, parsed.data!.id, answer as string);
  } catch (error) {
    logAndGetUserMessage(error);
    back("failed");
  }
  back(editNotice(result));
}

export async function approveAnswerAction(formData: FormData): Promise<void> {
  const { businessId, orgRole } = await requireBusinessContext();
  if (requireMinRole(orgRole, "org:member")) back("forbidden");
  const parsed = entryIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) back("invalid");
  let result: EntryEditResult;
  try {
    result = await approveAnswer(businessId, parsed.data!.id);
  } catch (error) {
    logAndGetUserMessage(error);
    back("failed");
  }
  back(result === "ok" ? "approved" : editNotice(result));
}

/** Regenerates one answer now (overwriting any edit -- the owner asked). Runs the model, so it takes a few seconds. */
export async function regenerateAnswerAction(formData: FormData): Promise<void> {
  const { businessId, orgRole } = await requireBusinessContext();
  if (requireMinRole(orgRole, "org:member")) back("forbidden");
  const parsed = entryIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) back("invalid");
  let outcome: Awaited<ReturnType<typeof regenerateEntry>>;
  try {
    outcome = await regenerateEntry(createServiceSupabaseClient(), businessId, parsed.data!.id);
  } catch (error) {
    logAndGetUserMessage(error);
    back("failed");
  }
  back(outcome === "ready" ? "regenerated" : outcome === "failed" ? "regen-failed" : "missing");
}

/** Re-checks every stored answer against the current content and rebuilds the stale ones. */
export async function refreshAnswersAction(): Promise<void> {
  const { businessId, orgRole } = await requireBusinessContext();
  if (requireMinRole(orgRole, "org:member")) back("forbidden");
  try {
    await enqueueAnswerBankRefresh(businessId);
    await runAnswerBankJob(businessId);
  } catch (error) {
    logAndGetUserMessage(error);
    back("failed");
  }
  back("refreshed");
}
