import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getConversationForBusiness } from "@/lib/conversations";
import { getWhatsappConnectionForBusiness, WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { createWhatsappOutboundMessage, sendWhatsappOutboundMessage } from "@/lib/whatsapp-delivery";
import { createMessage } from "@/lib/messages";
import { formatSlotLabel } from "@/lib/appointments";
import { sendAppointmentStatusEmail, type AppointmentStatusForEmail } from "@/lib/notifications";
import { logEvent } from "@/lib/logger";
import type { Appointment } from "@/lib/supabase/types";

const STATUS_MESSAGE: Record<AppointmentStatusForEmail, (label: string) => string> = {
  confirmed: (label) => `Your appointment for ${label} is confirmed. We look forward to speaking with you.`,
  declined: (label) =>
    `Unfortunately we couldn't confirm your requested appointment for ${label}. Please get back in touch to find another time.`,
  cancelled: (label) => `Your appointment for ${label} has been cancelled. Please get back in touch if you'd like to reschedule.`,
};

/**
 * Best-effort reply to the prospect after the business confirms/declines/
 * cancels an appointment they booked -- email (if they gave one) and, for
 * a WhatsApp-sourced conversation with an active connection, a real
 * WhatsApp reply too. The WhatsApp half reuses the exact sequence
 * app/(dashboard)/dashboard/conversations/actions.ts's sendHumanReplyAction
 * already established for staff replies (createMessage, then
 * createWhatsappOutboundMessage + sendWhatsappOutboundMessage) -- no
 * parallel send mechanism. The message insert uses the service-role
 * client deliberately: this is a system-generated notification, not a
 * staff-typed reply, so it must not depend on the conversation already
 * being in human control (the RLS policy gating an *authenticated*
 * 'human_agent' insert requires `control = 'human'`, which many booking
 * conversations never reach).
 *
 * Called only from the appointments dashboard's own confirm/decline/
 * cancel Server Actions, after the status transition has already
 * succeeded -- every failure here is logged and swallowed, never thrown,
 * so a notification-delivery problem can't turn an already-successful
 * admin action into an error.
 */
export async function notifyAppointmentStatusChange(
  businessId: string,
  appointment: Pick<Appointment, "id" | "conversation_id" | "contact_email" | "starts_at">,
  status: AppointmentStatusForEmail,
): Promise<void> {
  const serviceSupabase = createServiceSupabaseClient();
  const { data: business } = await serviceSupabase.from("businesses").select("timezone").eq("id", businessId).maybeSingle();
  const label = formatSlotLabel(new Date(appointment.starts_at), business?.timezone ?? "UTC");

  if (appointment.contact_email) {
    await sendAppointmentStatusEmail(businessId, appointment.contact_email, status, label);
  }

  if (!appointment.conversation_id) return;

  try {
    const supabase = createServerSupabaseClient();
    const conversation = await getConversationForBusiness(supabase, businessId, appointment.conversation_id);
    if (!conversation || conversation.source !== WHATSAPP_CONVERSATION_SOURCE || !conversation.visitor_id) return;

    const connection = await getWhatsappConnectionForBusiness(businessId);
    if (connection?.status !== "connected") return;

    const content = STATUS_MESSAGE[status](label);
    const message = await createMessage(serviceSupabase, businessId, conversation.id, "human_agent", content);
    const outbound = await createWhatsappOutboundMessage(serviceSupabase, {
      businessId,
      conversationId: conversation.id,
      messageId: message.id,
      toWaId: conversation.visitor_id,
      phoneNumberId: connection.phone_number_id,
      content,
    });
    await sendWhatsappOutboundMessage(outbound.id);
  } catch {
    logEvent("appointment_status_whatsapp_reply_failed", businessId, { appointmentId: appointment.id, status }, "error");
  }
}
