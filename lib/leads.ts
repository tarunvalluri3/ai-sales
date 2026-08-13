import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";
import type { LeadPersistInput } from "@/lib/schemas/lead";

/** Creates a lead for a business. `businessId` must come from `requireBusinessContext()`. Input must already be validated (`leadPersistSchema`). */
export async function createLead(
  businessId: string,
  conversationId: string,
  input: LeadPersistInput,
): Promise<Lead> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      interest_type: input.interestType,
      interest_id: input.interestId,
      notes: input.notes,
      qualification: input.qualification,
      qualification_reason: input.qualificationReason,
      source: input.source,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving this lead. Please try again.",
      "createLead failed",
      error,
    );
  }

  return data;
}

/** Lists all leads for a business. `businessId` must come from `requireBusinessContext()`. */
export async function listLeadsForBusiness(businessId: string): Promise<Lead[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError(
      "Something went wrong loading your leads. Please try again.",
      "listLeadsForBusiness failed",
      error,
    );
  }

  return data;
}

/**
 * Updates a lead's status, scoped to the given business. `id`s belonging
 * to another business (or nonexistent) affect zero rows -- returns
 * `false` rather than throwing, so the caller can show a safe "not
 * found" message without distinguishing that from a cross-tenant
 * attempt. Same contract as lib/products.ts's updateProduct().
 */
export async function updateLeadStatus(
  businessId: string,
  id: string,
  status: LeadStatus,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this lead. Please try again.",
      "updateLeadStatus failed",
      error,
    );
  }

  return data.length > 0;
}
