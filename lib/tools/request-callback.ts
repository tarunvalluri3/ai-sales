import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const NOTES_MAX_LENGTH = 2000;
const QUALIFICATION_REASON = "Prospect explicitly requested a callback via chat.";
const SOURCE = "request_callback_tool";

export const RequestCallbackInputSchema = z.object({
  contactName: z.string().trim().max(200).nullable().describe("The prospect's name, only if they volunteered it. Never invented."),
  contactEmail: z.string().trim().max(200).nullable().describe("The prospect's email, only if they gave it. Never invented."),
  contactPhone: z.string().trim().max(50).nullable().describe("The prospect's phone number, only if they gave it. Never invented."),
  notes: z.string().trim().max(500).nullable().describe("Any preferred callback time or additional context the prospect mentioned, in their own words."),
});

/**
 * Shaped for `bindTools()`, same convention as the read-only tools' exports.
 */
export const requestCallbackTool = {
  name: "request_callback",
  description:
    "Creates or updates a callback request for the current conversation. Only call this after the prospect has clearly agreed to a callback (in response to either their own request or your offer) AND you already have their email or phone number from this conversation. If the result comes back with reason 'missing_contact_info', ask the prospect for their email or phone number before calling this tool again -- do not call it again without contact info.",
  schema: RequestCallbackInputSchema,
};

export type RequestCallbackResult =
  | { success: true; leadId: string; created: boolean }
  | { success: false; reason: "missing_contact_info" | "invalid_input" | "lookup_failed" };

function appendNotes(existing: string | null, addition: string | null): string | null {
  if (!addition) return existing;
  if (!existing) return addition.slice(0, NOTES_MAX_LENGTH);
  const combined = `${existing}\n\n${addition}`;
  if (combined.length <= NOTES_MAX_LENGTH) return combined;
  const budget = NOTES_MAX_LENGTH - existing.length - 2;
  if (budget <= 0) return existing.slice(0, NOTES_MAX_LENGTH);
  return `${existing}\n\n${addition.slice(0, budget)}`;
}

/**
 * Authorized executor for the `request_callback` tool -- the first write
 * action any tool in this codebase can take. `businessId` and
 * `conversationId` both come from `askSalesEmployee`'s own trusted
 * parameters -- neither is part of `RequestCallbackInputSchema`, neither is
 * read from `rawArgs` (docs/security.md §1, §8, §9).
 *
 * Does its own direct, tenant-scoped `leads` queries with the passed-in
 * `supabase` client rather than routing through lib/leads.ts's
 * createLead()/getLeadForConversation() -- those construct a Clerk-session
 * client internally, which has no valid session on the widget's
 * service-role path (the same bug class STATE.md's
 * fix-widget-retrieval-client-injection entry already documents). Reuses
 * lib/conversations.ts's getConversationForBusiness() (already
 * client-injected) as the tenant-ownership guard before any write.
 *
 * Never throws -- every outcome, including a DB failure, comes back as a
 * structured RequestCallbackResult.
 */
export async function executeRequestCallback(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  rawArgs: unknown,
): Promise<RequestCallbackResult> {
  const parsed = RequestCallbackInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    console.error("request_callback: invalid tool-call args", businessId, conversationId, parsed.error.message);
    return { success: false, reason: "invalid_input" };
  }

  const contactEmail = normalizeEmail(parsed.data.contactEmail);
  const contactPhone = normalizePhone(parsed.data.contactPhone);
  if (contactEmail === null && contactPhone === null) {
    console.log("request_callback", businessId, conversationId, "missing_contact_info");
    return { success: false, reason: "missing_contact_info" };
  }

  const conversation = await getConversationForBusiness(supabase, businessId, conversationId);
  if (!conversation) {
    console.error("request_callback: conversation does not belong to business", businessId, conversationId);
    return { success: false, reason: "lookup_failed" };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id, contact_name, contact_email, contact_phone, notes")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (lookupError) {
    console.error("request_callback: existing-lead lookup failed", businessId, conversationId, lookupError);
    return { success: false, reason: "lookup_failed" };
  }

  const contactName = parsed.data.contactName?.trim() || null;
  const notes = parsed.data.notes?.trim() || null;

  if (existing) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        requested_callback: true,
        contact_name: existing.contact_name ?? contactName,
        contact_email: existing.contact_email ?? contactEmail,
        contact_phone: existing.contact_phone ?? contactPhone,
        notes: appendNotes(existing.notes, notes),
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("request_callback: update failed", businessId, conversationId, updateError);
      return { success: false, reason: "lookup_failed" };
    }

    console.log("request_callback", businessId, conversationId, "updated");
    return { success: true, leadId: existing.id, created: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      conversation_id: conversationId,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      interest_type: null,
      interest_id: null,
      notes,
      qualification: "warm",
      qualification_reason: QUALIFICATION_REASON,
      source: SOURCE,
      requested_callback: true,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("request_callback: insert failed", businessId, conversationId, insertError);
    return { success: false, reason: "lookup_failed" };
  }

  console.log("request_callback", businessId, conversationId, "created");
  return { success: true, leadId: inserted.id, created: true };
}
