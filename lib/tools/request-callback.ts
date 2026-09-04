import "server-only";
import { z } from "zod";
import { after } from "next/server";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";
import { logEvent } from "@/lib/logger";
import { enqueueLeadQualifiedWebhooks } from "@/lib/webhooks";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";

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
    "Creates or updates a callback request for the current conversation. Only call this after the prospect has clearly agreed to a callback (in response to either their own request or your offer) AND you already have their email or phone number from this conversation. If the result comes back with reason 'missing_contact_info', ask the prospect for their email or phone number before calling this tool again -- do not call it again without contact info. If the result comes back with reason 'consent_required', tell the prospect you need their consent to store their details and ask them to check the consent checkbox in the chat panel before calling this tool again -- do not treat a spoken 'yes' as consent.",
  schema: RequestCallbackInputSchema,
};

export type RequestCallbackResult =
  | { success: true; leadId: string; created: boolean }
  | { success: false; reason: "missing_contact_info" | "consent_required" | "invalid_input" | "lookup_failed" };

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
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "invalid_input" }, "error");
    return { success: false, reason: "invalid_input" };
  }

  const contactEmail = normalizeEmail(parsed.data.contactEmail);
  const contactPhone = normalizePhone(parsed.data.contactPhone);
  if (contactEmail === null && contactPhone === null) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "missing_contact_info" });
    return { success: false, reason: "missing_contact_info" };
  }

  const conversation = await getConversationForBusiness(supabase, businessId, conversationId);
  if (!conversation) {
    logEvent(
      "tool_invoked",
      businessId,
      { tool: "request_callback", conversationId, result: "conversation_not_found" },
      "error",
    );
    return { success: false, reason: "lookup_failed" };
  }

  if (!conversation.consent_given) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "consent_required" });
    return { success: false, reason: "consent_required" };
  }

  // A sandbox test conversation (dashboard/_components/sandbox-chat) must
  // never write a real lead or fire a real outbound webhook -- both
  // validation branches above still run normally so the sandbox stays a
  // realistic preview of the tool's behavior, only the actual persistence
  // and side effects are skipped.
  if (conversation.source === SANDBOX_CONVERSATION_SOURCE) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "sandbox_skipped" });
    return { success: true, leadId: "sandbox", created: true };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id, contact_name, contact_email, contact_phone, notes")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (lookupError) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "lookup_failed" }, "error");
    return { success: false, reason: "lookup_failed" };
  }

  const contactName = parsed.data.contactName?.trim() || null;
  const notes = parsed.data.notes?.trim() || null;

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        requested_callback: true,
        contact_name: existing.contact_name ?? contactName,
        contact_email: existing.contact_email ?? contactEmail,
        contact_phone: existing.contact_phone ?? contactPhone,
        notes: appendNotes(existing.notes, notes),
      })
      .eq("id", existing.id)
      .eq("business_id", businessId)
      .select("id");

    if (updateError) {
      logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "update_failed" }, "error");
      return { success: false, reason: "lookup_failed" };
    }

    if (!updated || updated.length === 0) {
      logEvent(
        "tool_invoked",
        businessId,
        { tool: "request_callback", conversationId, result: "update_affected_zero_rows" },
        "error",
      );
      return { success: false, reason: "lookup_failed" };
    }

    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "updated" });
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
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "insert_failed" }, "error");
    return { success: false, reason: "lookup_failed" };
  }

  logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "created" });

  // Phase 24: outbound webhook on a new qualified lead -- every lead
  // created via this tool starts 'warm' (QUALIFICATION_REASON above),
  // so a fresh creation is always a qualifying event. Never fired on the
  // update branch above (an existing lead getting a repeat callback
  // request is not a *new* qualified lead).
  await enqueueLeadQualifiedWebhooks(supabase, businessId, {
    event: "lead.qualified",
    leadId: inserted.id,
    conversationId,
    qualification: "warm",
    contactEmail,
    contactPhone,
    createdAt: new Date().toISOString(),
  });
  after(() => processWebhookDeliveries());

  return { success: true, leadId: inserted.id, created: true };
}
