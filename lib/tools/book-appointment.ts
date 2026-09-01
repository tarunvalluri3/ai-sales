import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness } from "@/lib/conversations";
import { normalizeEmail, normalizePhone } from "@/lib/schemas/lead";
import { isSlotAvailable, createAppointment } from "@/lib/appointments";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const BookAppointmentInputSchema = z.object({
  startsAt: z
    .string()
    .trim()
    .min(1)
    .describe("The exact startsAt value of a slot returned by check_available_slots -- never a time you invent or estimate yourself."),
  contactName: z.string().trim().max(200).nullable().describe("The prospect's name, only if they volunteered it. Never invented."),
  contactEmail: z.string().trim().max(200).nullable().describe("The prospect's email, only if they gave it. Never invented."),
  contactPhone: z.string().trim().max(50).nullable().describe("The prospect's phone number, only if they gave it. Never invented."),
  notes: z.string().trim().max(500).nullable().describe("Any additional context the prospect mentioned about this appointment, in their own words."),
});

export const bookAppointmentTool = {
  name: "book_appointment",
  description:
    "Requests an appointment at a specific slot returned by check_available_slots. Only call this after the prospect has explicitly agreed to that exact time AND you already have their email or phone number from this conversation. The booking is pending the business's own confirmation -- tell the prospect that, don't say it's confirmed. If the result comes back with reason 'missing_contact_info', ask for their email or phone number before calling this tool again. If it comes back with reason 'consent_required', ask the prospect to check the consent checkbox in the chat panel before calling this tool again -- do not treat a spoken 'yes' as consent. If it comes back with reason 'slot_unavailable', that slot was just taken -- call check_available_slots again and offer a different time.",
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
  return {
    success: true,
    appointmentId: appointment.id,
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: business.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(appointment.starts_at)),
  };
}
