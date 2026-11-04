import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { createWhatsappOutboundMessage, sendWhatsappOutboundMessage } from "@/lib/whatsapp-delivery";
import { INSTAGRAM_CONVERSATION_SOURCE } from "@/lib/instagram";
import { createInstagramOutboundMessage, sendInstagramOutboundMessage } from "@/lib/instagram-delivery";
import { createMessage } from "@/lib/messages";
import { formatSlotLabel } from "@/lib/appointments";
import { sendAppointmentStatusEmail, type AppointmentStatusForEmail } from "@/lib/notifications";
import type { SendEmailOutcome } from "@/lib/email-sender";
import { logEvent } from "@/lib/logger";
import { appointmentTemplateParams, resolveWhatsappTemplate, type WhatsappTemplateKind } from "@/lib/whatsapp-templates";
import type { Appointment } from "@/lib/supabase/types";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const STATUS_MESSAGE: Record<AppointmentStatusForEmail, (label: string) => string> = {
  confirmed: (label) => `Your appointment for ${label} is confirmed. We look forward to speaking with you.`,
  declined: (label) =>
    `Unfortunately we couldn't confirm your requested appointment for ${label}. Please get back in touch to find another time.`,
  cancelled: (label) => `Your appointment for ${label} has been cancelled. Please get back in touch if you'd like to reschedule.`,
};

const STATUS_TEMPLATE: Record<AppointmentStatusForEmail, WhatsappTemplateKind> = {
  confirmed: "appointment_confirmed",
  declined: "appointment_declined",
  cancelled: "appointment_cancelled",
};

/**
 * Best-effort reply to the prospect after the business confirms/declines/
 * cancels an appointment they booked -- email (if they gave one) and, for
 * a WhatsApp- or Instagram-sourced conversation with an active connection,
 * a real reply over that channel too. Each channel's half reuses the exact
 * queue staff replies use (createMessage, then create*OutboundMessage +
 * send*OutboundMessage) -- no parallel send mechanism. The message insert
 * uses the service-role client deliberately: this is a system-generated
 * notification, not a staff-typed reply, so it must not depend on the
 * conversation already being in human control.
 *
 * Production readiness (item 4): on WhatsApp the notice carries its approved
 * template, so it still arrives when the owner confirms more than 24 hours
 * after the prospect's last message (lib/whatsapp-delivery.ts sends the
 * template once the free-form window has closed). With no template
 * configured, or on Instagram outside its window, it is NOT sent, the
 * conversation is flagged, and `channelReply` says `not_delivered` so the
 * business's receipt tells them to reach out another way.
 *
 * Called only after the status transition has already succeeded -- every
 * failure here is logged and swallowed, never thrown.
 */
export type AppointmentStatusNotifyResult = {
  /** `no_address` is the prospect never having given an email at all. */
  prospectEmail: SendEmailOutcome | "no_address";
  channelReply: ChannelNoticeResult;
};

export type ChannelNoticeResult = "sent" | "not_applicable" | "no_connection" | "not_delivered" | "failed";

export async function notifyAppointmentStatusChange(
  businessId: string,
  appointment: Pick<Appointment, "id" | "conversation_id" | "contact_email" | "contact_name" | "starts_at">,
  status: AppointmentStatusForEmail,
): Promise<AppointmentStatusNotifyResult> {
  const serviceSupabase = createServiceSupabaseClient();
  const business = await loadBusinessForNotice(serviceSupabase, businessId);
  const label = formatSlotLabel(new Date(appointment.starts_at), business.timezone);

  const prospectEmail: AppointmentStatusNotifyResult["prospectEmail"] = appointment.contact_email
    ? await sendAppointmentStatusEmail(businessId, appointment.contact_email, status, label)
    : "no_address";

  const channelReply = await sendAppointmentChannelNotice(serviceSupabase, businessId, appointment, {
    templateKind: STATUS_TEMPLATE[status],
    content: STATUS_MESSAGE[status](label),
    businessName: business.name,
    slotLabel: label,
  });

  return { prospectEmail, channelReply };
}

export async function loadBusinessForNotice(
  supabase: ServiceSupabaseClient,
  businessId: string,
): Promise<{ name: string; timezone: string }> {
  const { data } = await supabase
    .from("businesses")
    .select("name, timezone")
    .eq("id", businessId)
    .maybeSingle<{ name: string; timezone: string | null }>();
  return { name: data?.name ?? "our team", timezone: data?.timezone ?? "UTC" };
}

/**
 * Sends one appointment notice (status change, reminder, expiry) to the
 * prospect over the conversation's own channel, if it came from WhatsApp or
 * Instagram. Service-role client only, every read scoped to `businessId`, so
 * it works from the dashboard and from the scheduler alike. Never throws.
 */
export async function sendAppointmentChannelNotice(
  supabase: ServiceSupabaseClient,
  businessId: string,
  appointment: Pick<Appointment, "id" | "conversation_id" | "contact_name">,
  notice: { templateKind: WhatsappTemplateKind; content: string; businessName: string; slotLabel: string },
): Promise<ChannelNoticeResult> {
  if (!appointment.conversation_id) return "not_applicable";

  try {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, source, visitor_id")
      .eq("business_id", businessId)
      .eq("id", appointment.conversation_id)
      .maybeSingle<{ id: string; source: string | null; visitor_id: string | null }>();
    if (!conversation || !conversation.visitor_id) return "not_applicable";

    if (conversation.source === WHATSAPP_CONVERSATION_SOURCE) {
      const { data: connection } = await supabase
        .from("whatsapp_connections")
        .select("phone_number_id, status")
        .eq("business_id", businessId)
        .maybeSingle<{ phone_number_id: string; status: string }>();
      if (connection?.status !== "connected") return "no_connection";

      const message = await createMessage(supabase, businessId, conversation.id, "human_agent", notice.content);
      const outbound = await createWhatsappOutboundMessage(supabase, {
        businessId,
        conversationId: conversation.id,
        messageId: message.id,
        toWaId: conversation.visitor_id,
        phoneNumberId: connection.phone_number_id,
        content: notice.content,
        templateFallback: {
          kind: notice.templateKind,
          template: resolveWhatsappTemplate(notice.templateKind, process.env),
          params: appointmentTemplateParams({
            contactName: appointment.contact_name ?? null,
            businessName: notice.businessName,
            slotLabel: notice.slotLabel,
          }),
        },
      });
      const result = await sendWhatsappOutboundMessage(outbound.id);
      if (result.success || result.reason === "retry_scheduled") return "sent";
      return result.reason === "failed" ? "failed" : "not_delivered";
    }

    if (conversation.source === INSTAGRAM_CONVERSATION_SOURCE) {
      // Instagram has no templates: outside its 24-hour window the notice is
      // not sent and the conversation is flagged (lib/instagram-delivery.ts).
      const { data: connection } = await supabase
        .from("instagram_connections")
        .select("instagram_business_account_id, status")
        .eq("business_id", businessId)
        .maybeSingle<{ instagram_business_account_id: string; status: string }>();
      if (connection?.status !== "connected") return "no_connection";

      const message = await createMessage(supabase, businessId, conversation.id, "human_agent", notice.content);
      const outbound = await createInstagramOutboundMessage(supabase, {
        businessId,
        conversationId: conversation.id,
        messageId: message.id,
        toIgId: conversation.visitor_id,
        instagramBusinessAccountId: connection.instagram_business_account_id,
        content: notice.content,
      });
      const result = await sendInstagramOutboundMessage(outbound.id);
      if (result.success || result.reason === "retry_scheduled") return "sent";
      return result.reason === "failed" ? "failed" : "not_delivered";
    }

    return "not_applicable";
  } catch {
    logEvent("appointment_channel_notice_failed", businessId, { appointmentId: appointment.id, templateKind: notice.templateKind }, "error");
    return "failed";
  }
}
