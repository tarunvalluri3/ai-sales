import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness, SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";
import { isSlotAvailable, createAppointment } from "@/lib/appointments";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const BookAppointmentInputSchema = z.object({
  startsAt: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The exact startsAt value of a slot from a check_available_slots result you called earlier in this same reply -- never a value from an earlier conversation turn (it is not retained), and never a time you invent, estimate, or reconstruct from words like '9am Wednesday'. If confirming a time offered earlier in the conversation, call check_available_slots again first to get its real current startsAt value.",
    ),
  contactName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .describe(
      "The prospect's name, ONLY if they literally typed it earlier in this conversation. If they never gave a name, you MUST pass null -- do not invent one, and never use a placeholder like 'Prospect', 'Customer', or 'Guest'.",
    ),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .describe("The prospect's email, ONLY if they literally typed it earlier in this conversation. If they never gave one, you MUST pass null -- do not invent or guess one."),
  contactPhone: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .describe(
      "The prospect's phone number, ONLY if they literally typed it earlier in this conversation. If they never gave one, you MUST pass null -- do not invent one, do not reuse a number from an example, and do not fill it with a placeholder like all the same digit.",
    ),
  notes: z.string().trim().max(500).nullable().describe("Any additional context the prospect mentioned about this appointment, in their own words. Null if nothing extra was said."),
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

  const contactEmail = normalizeEmail(parsed.data.contactEmail);
  const contactPhone = normalizePhone(parsed.data.contactPhone);
  if (contactEmail === null && contactPhone === null) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "missing_contact_info" });
    return { success: false, reason: "missing_contact_info" };
  }

  const conversation = await getConversationForBusiness(supabase, businessId, conversationId);
  if (!conversation) {
    logEvent("tool_invoked", businessId, { tool: "book_appointment", conversationId, result: "conversation_not_found" }, "error");
    return { success: false, reason: "lookup_failed" };
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
  return { success: true, appointmentId: appointment.id, label };
}
