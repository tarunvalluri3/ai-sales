import "server-only";
import { z } from "zod";
import { after } from "next/server";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";
import { upsertLeadForConversation } from "@/lib/leads";
import { logEvent } from "@/lib/logger";
import { WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { enqueueLeadQualifiedWebhooks } from "@/lib/webhooks";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const SOURCE = "request_callback_tool";

// .nullable().optional() on every field below, not just .nullable() --
// Gemini's function calling sometimes omits an argument key entirely
// instead of emitting an explicit `null` for it, which a bare .nullable()
// schema rejects as undefined (see lib/tools/recommend-products.ts for the
// flake this was root-caused from). Callers already normalize with `?.` /
// `?? null`, so accepting an omitted key is a pure robustness gain, not a
// behavior change.
export const RequestCallbackInputSchema = z.object({
  contactName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .describe(
      "The prospect's name, ONLY if they literally typed it earlier in this conversation. If they never gave a name, you MUST pass null -- do not invent one, and never use a placeholder like 'Prospect', 'Customer', or 'Guest'.",
    ),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .describe("The prospect's email, ONLY if they literally typed it earlier in this conversation. If they never gave one, you MUST pass null -- do not invent or guess one."),
  contactPhone: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .describe(
      "The prospect's phone number, ONLY if they literally typed it earlier in this conversation. If they never gave one, you MUST pass null -- do not invent one, do not reuse a number from an example, and do not fill it with a placeholder like all the same digit.",
    ),
  notes: z.string().trim().max(500).nullable().optional().describe("Any preferred callback time or additional context the prospect mentioned, in their own words. Null if nothing extra was said."),
});

/**
 * Shaped for `bindTools()`, same convention as the read-only tools' exports.
 */
export const requestCallbackTool = {
  name: "request_callback",
  description:
    "Creates or updates a callback request for the current conversation. Only call this after the prospect has clearly agreed to a callback (in response to either their own request or your offer) AND you already have their email or phone number from this conversation. Before calling, you should have also asked for their name if you don't already have it -- but if they declined or didn't give one, proceed anyway with contactName null; never delay the callback over a missing name. Pass ONLY contact details the prospect actually typed -- if they gave an email but not a name or phone, pass null for the ones they didn't give; never invent, guess, or placeholder any of contactName/contactEmail/contactPhone. If the result comes back with reason 'missing_contact_info', ask the prospect for their email or phone number before calling this tool again -- do not call it again without contact info. If the result comes back with reason 'consent_required', tell the prospect you need their consent to store their details and ask them to check the consent checkbox in the chat panel before calling this tool again -- do not treat a spoken 'yes' as consent.",
  schema: RequestCallbackInputSchema,
};

export type RequestCallbackResult =
  | { success: true; leadId: string; created: boolean }
  | { success: false; reason: "missing_contact_info" | "consent_required" | "invalid_input" | "lookup_failed" };

/**
 * Authorized executor for the `request_callback` tool -- the first write
 * action any tool in this codebase can take. `businessId` and
 * `conversationId` both come from `askSalesEmployee`'s own trusted
 * parameters -- neither is part of `RequestCallbackInputSchema`, neither is
 * read from `rawArgs` (docs/security.md §1, §8, §9).
 *
 * Lead persistence itself goes through lib/leads.ts's
 * upsertLeadForConversation() (client-injected, shared with
 * book_appointment) rather than createLead()/getLeadForConversation() --
 * those construct a Clerk-session client internally, which has no valid
 * session on the widget's service-role path (the same bug class
 * STATE.md's fix-widget-retrieval-client-injection entry already
 * documents). Reuses lib/conversations.ts's getConversationForBusiness()
 * (already client-injected) as the tenant-ownership guard before any
 * write.
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

  const contactEmail = normalizeEmail(parsed.data.contactEmail ?? null);
  // A WhatsApp conversation's visitor_id IS the prospect's real phone
  // number (Meta's own HMAC-verified wa_id, lib/whatsapp.ts) -- more
  // trustworthy than anything typed in the chat, so it's used whenever
  // the prospect didn't separately type a number. Never applied to the
  // widget's own visitor_id, which is client-generated and untrusted.
  const waFallbackPhone = conversation.source === WHATSAPP_CONVERSATION_SOURCE ? conversation.visitor_id : null;
  const contactPhone = normalizePhone(parsed.data.contactPhone ?? null) ?? normalizePhone(waFallbackPhone);
  if (contactEmail === null && contactPhone === null) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "missing_contact_info" });
    return { success: false, reason: "missing_contact_info" };
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

  const contactName = parsed.data.contactName?.trim() || null;
  const notes = parsed.data.notes?.trim() || null;

  const result = await upsertLeadForConversation(supabase, businessId, conversationId, {
    contactName,
    contactEmail,
    contactPhone,
    notes,
    requestedCallback: true,
    appointmentBooked: false,
    needsAttention: conversation.needs_attention,
    interestSpecified: false,
    source: SOURCE,
  });

  if (!result.success) {
    logEvent("tool_invoked", businessId, { tool: "request_callback", conversationId, result: "lookup_failed" }, "error");
    return { success: false, reason: "lookup_failed" };
  }

  logEvent(
    "tool_invoked",
    businessId,
    { tool: "request_callback", conversationId, result: result.created ? "created" : "updated" },
  );

  // Phase 24: outbound webhook on a new qualified lead. Never fired on
  // the update branch (an existing lead getting a repeat callback
  // request is not a *new* qualified lead).
  if (result.created) {
    await enqueueLeadQualifiedWebhooks(supabase, businessId, {
      event: "lead.qualified",
      leadId: result.leadId,
      conversationId,
      qualification: result.qualification,
      contactEmail,
      contactPhone,
      createdAt: new Date().toISOString(),
    });
    after(() => processWebhookDeliveries());
  }

  return { success: true, leadId: result.leadId, created: result.created };
}
