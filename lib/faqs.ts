import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Faq } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import { syncGeneratedDocument, deleteGeneratedDocument } from "@/lib/knowledge-sync";

export type FaqInput = {
  question: string;
  answer: string;
};

function buildKnowledgeContent(input: FaqInput): string {
  return `Q: ${input.question}\n\nA: ${input.answer}`;
}

/** Looks up a single FAQ, scoped to the given business. `null` if it doesn't exist or belongs to another business. */
export async function getFaq(businessId: string, id: string): Promise<Faq | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading this FAQ. Please try again.",
      "getFaq failed",
      error,
    );
  }

  return data;
}

/** Lists all approved FAQs for a business. `businessId` must come from `requireBusinessContext()`. Excludes unreviewed extractions -- see `listPendingReviewFaqs`. */
export async function listFaqsForBusiness(businessId: string): Promise<Faq[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading your FAQs. Please try again.",
      "listFaqsForBusiness failed",
      error,
    );
  }

  return data;
}

/** Lists FAQs extracted from a knowledge document that are awaiting review. `businessId` must come from `requireBusinessContext()`. */
export async function listPendingReviewFaqs(businessId: string): Promise<Faq[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(
      "Something went wrong loading FAQs awaiting review. Please try again.",
      "listPendingReviewFaqs failed",
      error,
    );
  }

  return data;
}

/** Creates an FAQ for a business. `businessId` must come from `requireBusinessContext()`. */
export async function createFaq(businessId: string, input: FaqInput): Promise<Faq> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .insert({ business_id: businessId, ...input })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this FAQ. Please try again.",
      "createFaq failed",
      error,
    );
  }

  await syncGeneratedDocument(businessId, "faq", data.id, data.question, buildKnowledgeContent(input));

  return data;
}

/**
 * Updates an FAQ, scoped to the given business. `id`s belonging to another
 * business (or nonexistent) affect zero rows — returns `false` rather
 * than throwing, so the caller can show a safe "not found" message
 * without distinguishing that from a cross-tenant attempt.
 */
export async function updateFaq(
  businessId: string,
  id: string,
  input: FaqInput,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .update(input)
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this FAQ. Please try again.",
      "updateFaq failed",
      error,
    );
  }

  if (data.length === 0) {
    return false;
  }

  await syncGeneratedDocument(businessId, "faq", id, input.question, buildKnowledgeContent(input));

  return true;
}

/** Deletes an FAQ, scoped to the given business. See `updateFaq` for the not-found contract. */
export async function deleteFaq(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting this FAQ. Please try again.",
      "deleteFaq failed",
      error,
    );
  }

  if (data.length === 0) {
    return false;
  }

  await deleteGeneratedDocument(businessId, "faq", id);

  return true;
}

/**
 * Approves a pending extracted FAQ: flips it to 'approved' and syncs its
 * generated knowledge document, the same call `createFaq` already makes --
 * so an approved extraction becomes tool-queryable and RAG-retrievable
 * through the exact same path as a manually created FAQ, no second code
 * path. Scoped to `status = 'draft'` so this can never re-sync an
 * already-approved row. `false` for a cross-tenant, nonexistent, or
 * already-approved id.
 */
export async function approveFaqDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .update({ status: "approved" })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select();

  if (error) {
    throw new AppError(
      "Something went wrong approving this FAQ. Please try again.",
      "approveFaqDraft failed",
      error,
    );
  }

  const faq = data[0];
  if (!faq) {
    return false;
  }

  await syncGeneratedDocument(businessId, "faq", faq.id, faq.question, buildKnowledgeContent(faq));

  return true;
}

/**
 * Rejects (deletes) a pending extracted FAQ. Safe without a
 * `deleteGeneratedDocument` call -- a draft never gets a generated
 * document synced for it (see `approveFaqDraft`). Scoped to
 * `status = 'draft'` so this can never delete an already-approved row.
 */
export async function rejectFaqDraft(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong rejecting this FAQ. Please try again.",
      "rejectFaqDraft failed",
      error,
    );
  }

  return data.length > 0;
}
