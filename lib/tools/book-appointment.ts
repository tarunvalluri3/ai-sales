import "server-only";
import { z } from "zod";
import { after } from "next/server";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";
import { isSlotAvailable, createAppointment } from "@/lib/appointments";
import { upsertLeadForConversation } from "@/lib/leads";
import { enqueueLeadQualifiedWebhooks } from "@/lib/webhooks";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";
import { logEvent } from "@/lib/logger";
import { WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";

const SOURCE = "book_appointment_tool";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const BookAppointmentInputSchema = z.object({
  startsAt: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The exact startsAt value of a slot from a check_available_slots result you called earlier in this same reply -- never a value from an earlier conversation turn (it is not retained), and never a time you invent, estimate, or reconstruct from words like '9am Wednesday'. If confirming a time offered earlier in the conversation, call check_available_slots again first to get its real current startsAt value.",
    ),
  // .nullable().optional() on every field below, not just .nullable() --
  // Gemini's function calling sometimes omits an argument key entirely
  // instead of emitting an explicit `null` for it, which a bare
  // .nullable() schema rejects as undefined (see
  // lib/tools/recommend-products.ts for the flake this was root-caused
  // from). Callers already normalize with `?.` / `?? null`, so accepting
  // an omitted key is a pure robustness gain, not a behavior change.
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
  notes: z.string().trim().max(500).nullable().optional().describe("Any additional context the prospect mentioned about this appointment, in their own words. Null if nothing extra was said."),
});

export const bookAppointmentTool = {
  name: "book_appointment",
  description:
    "Requests an appointment at a specific slot returned by check_available_slots. Only call this after the prospect has explicitly agreed to that exact time AND you already have their email or phone number from this conversation. Pass ONLY contact details the prospect actually typed -- if they gave an email but not a name or phone, pass null for the ones they didn't give; never invent, guess, or placeholder any of contactName/contactEmail/contactPhone. The booking is pending the business's own confirmation -- tell the prospect that, don't say it's confirmed. If the result comes back with reason 'missing_contact_info', ask for their email or phone number before calling this tool again. If it comes back with reason 'consent_required', ask the prospect to check the consent checkbox in the chat panel before calling this tool again -- do not treat a spoken 'yes' as consent. If it comes back with reason 'slot_unavailable', that slot was just taken -- call check_available_slots again and offer a different time.",
  schema: BookAppointmentInputSchema,
};

export type BookAppointmentResult =
  | { success: true; appointmentId: string; label: string }
  | { success: false; reason: "missing_contact_info" | "consent_required" | "slot_unavailable" | "invalid_input" | "lookup_failed" };

/**
 * Authorized executor for the `book_appointment` tool. `businessId`/
 * `conversationId` both come from `askSalesEmployee`'s own trusted
 * parameters, never from `rawArgs` (docs/security.md §1, §8, §9). Follows
 * `lib/tools/request-callback.ts`'s exact consent-gating shape: the
 * conversation's own `consent_given` flag (only ever set by the widget's
 * own consent checkbox) is required before any PII is written, and never
 * throws -- every outcome comes back as a structured result.
 *
 * On a real (non-sandbox) booking, also upserts the conversation's lead
 * via lib/leads.ts's upsertLeadForConversation() -- booking a call is
 * itself a strong qualification signal that was previously lost
 * entirely (this tool never touched `leads` before). Best-effort: a
 * lead-write failure is logged but never turns a successful booking
 * into a failure response, since the prospect's appointment is already
 * real at that point.
 */
export async function executeBookAppointment(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
  rawArgs: unknown,
): Promise<BookAppointmentResult> {
  const parsed = BookAppointmentInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "invalid_input" }, "error");
    return { success: false, reason: "invalid_input" };
  }

  const conversation = await getConversationForBusiness(supabase, businessId, conversationId);
  if (!conversation) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "conversation_not_found" }, "error");
    return { success: false, reason: "lookup_failed" };
  }

  const contactEmail = normalizeEmail(parsed.data.contactEmail ?? null);
  // A WhatsApp conversation's visitor_id IS the prospect's real phone
  // number (Meta's own HMAC-verified wa_id, docs/whatsapp.ts) -- more
  // trustworthy than anything typed in the chat, so it's used whenever
  // the prospect didn't separately type a number. Never applied to the
  // widget's own visitor_id, which is client-generated and untrusted.
  const waFallbackPhone = conversation.source === WHATSAPP_CONVERSATION_SOURCE ? conversation.visitor_id : null;
  const contactPhone = normalizePhone(parsed.data.contactPhone ?? null) ?? normalizePhone(waFallbackPhone);
  if (contactEmail === null && contactPhone === null) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "missing_contact_info" });
    return { success: false, reason: "missing_contact_info" };
  }

  if (!conversation.consent_given) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "consent_required" });
    return { success: false, reason: "consent_required" };
  }

  const available = await isSlotAvailable(supabase, businessId, parsed.data.startsAt);
  if (!available) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "slot_unavailable" });
    return { success: false, reason: "slot_unavailable" };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("appointment_slot_minutes, timezone")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "business_not_found" }, "error");
    return { success: false, reason: "lookup_failed" };
  }

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: business.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed.data.startsAt));

  // A sandbox test conversation (dashboard/_components/sandbox-chat) must
  // never write a real appointment -- the slot-availability check above
  // still ran normally, so the sandbox stays a realistic preview of the
  // tool's behavior, only the actual persistence is skipped.
  if (conversation.source === SANDBOX_CONVERSATION_SOURCE) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "sandbox_skipped" });
    return { success: true, appointmentId: "sandbox", label };
  }

  const appointment = await createAppointment(supabase, businessId, {
    conversationId,
    contactName: parsed.data.contactName?.trim() || null,
    contactEmail,
    contactPhone,
    notes: parsed.data.notes?.trim() || null,
    startsAt: parsed.data.startsAt,
    slotMinutes: business.appointment_slot_minutes,
  });

  if (!appointment) {
    // The unique-index race: someone else took this slot between the
    // isSlotAvailable check above and the insert.
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "slot_unavailable" });
    return { success: false, reason: "slot_unavailable" };
  }

  logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "created" });

  const leadResult = await upsertLeadForConversation(supabase, businessId, conversationId, {
    contactName: parsed.data.contactName?.trim() || null,
    contactEmail,
    contactPhone,
    notes: parsed.data.notes?.trim() || null,
    requestedCallback: false,
    appointmentBooked: true,
    needsAttention: conversation.needs_attention,
    interestSpecified: false,
    source: SOURCE,
  });

  if (!leadResult.success) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "lead_upsert_failed" }, "error");
  } else {
    logEvent(
      "tool_invoked",
      businessId,
      { tool: "book_appointment", conversationId, result: leadResult.created ? "lead_created" : "lead_updated" },
    );

    if (leadResult.created) {
      await enqueueLeadQualifiedWebhooks(supabase, businessId, {
        event: "lead.qualified",
        leadId: leadResult.leadId,
        conversationId,
        qualification: leadResult.qualification,
        contactEmail,
        contactPhone,
        createdAt: new Date().toISOString(),
      });
      after(() => processWebhookDeliveries());
    }
  }

  return { success: true, appointmentId: appointment.id, label };
}
