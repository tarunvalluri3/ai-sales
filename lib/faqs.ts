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

/** Lists all FAQs for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listFaqsForBusiness(businessId: string): Promise<Faq[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("faqs")
    .select("*")
    .eq("business_id", businessId)
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
