import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { getAppUrl } from "@/lib/app-url";
import { renderBrandedEmail } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sender";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BUSINESSES_PER_RUN = 200;

/**
 * Same null-safe sandbox exclusion as lib/conversations.ts's own
 * EXCLUDE_SANDBOX_FILTER -- a business owner's own sandbox testing must
 * never trigger a "you have a new lead" / "needs attention" email about
 * itself.
 */
const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;

/**
 * 2026-10-19: every sender here now renders through lib/email-template.ts
 * (branded HTML with a plain-text part) and leaves through
 * lib/email-sender.ts, which owns the API-key check, the suppression check,
 * the from-address and reply routing. Each function below keeps its own
 * signature, return shape and log event names unchanged, so none of its
 * callers had to move.
 *
 * Two kinds of recipient, and the difference matters:
 * - **The business itself** (digest, new-appointment alert, workflow
 *   email): mail comes from Waves AI Pilot, which is accurate.
 * - **A prospect** (appointment status): mail speaks *for* the business, so
 *   it is sent "Acme Dental via Waves AI Pilot" with `replyTo` set to the
 *   business's own address. Previously it came from "Waves AI Pilot" with
 *   no reply-to at all, so a prospect answering "can we do Thursday
 *   instead?" was writing to an inbox nobody reads.
 */

export type NotificationDigestResult = { sent: number; skipped: number; failed: number };

/**
 * Phase 29: the workflow engine's `email_notification` action. Recipient is
 * the business's own `contact_email`, same known limitation as the daily
 * digest below (no dedicated staff-notification-recipients list exists
 * yet). Client-injected since the workflow engine itself is client-injected
 * (runs under either the service-role or the Clerk-authenticated client,
 * depending on what triggered the workflow). Never throws -- a failed
 * notification must not fail the workflow run that's sending it.
 */
export async function sendWorkflowNotificationEmail(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  businessId: string,
  subject: string,
  message: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    logEvent("workflow_notification_email_skipped_no_api_key", businessId);
    return false;
  }

  const { data: business } = await supabase.from("businesses").select("contact_email").eq("id", businessId).maybeSingle();
  if (!business?.contact_email) {
    logEvent("workflow_notification_email_skipped_no_contact_email", businessId);
    return false;
  }

  const outcome = await sendEmail({
    to: business.contact_email,
    subject,
    email: renderBrandedEmail({
      heading: subject,
      // Admin-authored workflow text; blank lines become paragraph breaks.
      paragraphs: message.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
      cta: { label: "Open your dashboard", url: `${getAppUrl()}/dashboard` },
      footnote: "Sent by a workflow you set up in Waves AI Pilot.",
    }),
  });

  if (outcome === "sent") return true;
  logEvent(
    outcome === "suppressed" ? "workflow_notification_email_suppressed" : "workflow_notification_email_failed",
    businessId,
    {},
    outcome === "failed" ? "error" : "info",
  );
  return false;
}

/**
 * Daily handoff/lead email digest (Phase 25b) -- part of the shared daily
 * cron backstop (app/api/cron/process-ingestion-queue/route.ts). For every
 * business with a `contact_email` set, sends one email summarizing new
 * leads in the last 24h and conversations currently needing attention --
 * skipped entirely (not sent) when both are zero, so a quiet business never
 * gets an empty digest.
 *
 * Recipient is `businesses.contact_email` -- the only business-level email
 * address this app collects (Phase 13b). **Known limitation**: this
 * conflates "how a prospect reaches the business" with "who gets
 * operational alerts."
 *
 * A silent no-op (one log line, not an error) when `RESEND_API_KEY` is
 * unset. A single business's send failure never blocks another's. A
 * suppressed (previously bounced) contact address counts as `skipped`, not
 * `failed` -- nothing went wrong in this run, the address is known-dead.
 */
export async function sendDailyDigestEmails(): Promise<NotificationDigestResult> {
  if (!process.env.RESEND_API_KEY) {
    logEvent("notification_digest_skipped_no_api_key", "unknown");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const supabase = createServiceSupabaseClient();
  const dashboardUrl = `${getAppUrl()}/dashboard`;

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, contact_email")
    .not("contact_email", "is", null)
    .limit(MAX_BUSINESSES_PER_RUN);

  if (error || !businesses) {
    logEvent("notification_digest_query_failed", "unknown", {}, "error");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const cutoffIso = new Date(Date.now() - DAY_MS).toISOString();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const business of businesses) {
    if (!business.contact_email) continue;

    try {
      const [{ count: newLeadCount }, { count: needsAttentionCount }] = await Promise.all([
        supabase
          .from("leads")
          .select("id, conversations!inner(source)", { count: "exact", head: true })
          .eq("business_id", business.id)
          .gte("created_at", cutoffIso)
          .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("needs_attention", true)
          .or(EXCLUDE_SANDBOX_FILTER),
      ]);

      const leads = newLeadCount ?? 0;
      const needsAttention = needsAttentionCount ?? 0;

      if (leads === 0 && needsAttention === 0) {
        skipped++;
        continue;
      }

      const subject =
        needsAttention > 0
          ? `${needsAttention} conversation(s) need attention — ${business.name}`
          : `${leads} new lead(s) in the last 24 hours — ${business.name}`;

      const outcome = await sendEmail({
        to: business.contact_email,
        subject,
        email: renderBrandedEmail({
          heading: `Your daily summary for ${business.name}`,
          facts: [
            { label: "New leads, last 24 hours", value: String(leads) },
            { label: "Conversations needing attention now", value: String(needsAttention) },
          ],
          cta: { label: "Review in your dashboard", url: dashboardUrl },
          footnote: "You get this once a day, and only on days something happened.",
        }),
      });

      if (outcome === "sent") {
        sent++;
      } else if (outcome === "suppressed") {
        skipped++;
        logEvent("notification_digest_suppressed", business.id);
      } else {
        failed++;
        logEvent("notification_digest_send_failed", business.id, {}, "error");
      }
    } catch {
      failed++;
      logEvent("notification_digest_send_failed", business.id, {}, "error");
    }
  }

  return { sent, skipped, failed };
}

/**
 * Immediate admin alert for a brand-new pending appointment request -- fires
 * right when the AI's book_appointment tool creates the row, so a business
 * doesn't have to wait until the next day to learn a prospect is waiting on
 * a confirmation. Never throws -- a failed send here must never turn a
 * successful booking into an error response.
 */
export async function sendNewAppointmentRequestEmail(
  businessId: string,
  appointment: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; label: string },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logEvent("appointment_request_email_skipped_no_api_key", businessId);
    return;
  }

  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("name, contact_email").eq("id", businessId).maybeSingle();
  if (!business?.contact_email) {
    logEvent("appointment_request_email_skipped_no_contact_email", businessId);
    return;
  }

  const outcome = await sendEmail({
    to: business.contact_email,
    subject: `New appointment request — ${business.name}`,
    // Reply-to the prospect when they gave an address: replying to this
    // alert is the fastest way for the business to reach them.
    replyTo: appointment.contactEmail,
    email: renderBrandedEmail({
      heading: "A new appointment request just came in",
      paragraphs: [`Someone asked to book a time with ${business.name}. It's waiting for you to confirm or decline.`],
      facts: [
        { label: "When", value: appointment.label },
        { label: "Name", value: appointment.contactName ?? "Not given" },
        { label: "Email", value: appointment.contactEmail ?? "Not given" },
        { label: "Phone", value: appointment.contactPhone ?? "Not given" },
      ],
      cta: { label: "Confirm or decline", url: `${getAppUrl()}/dashboard/appointments` },
    }),
  });

  if (outcome === "sent") {
    logEvent("appointment_request_email_sent", businessId);
  } else if (outcome === "suppressed") {
    logEvent("appointment_request_email_suppressed", businessId);
  } else if (outcome === "failed") {
    logEvent("appointment_request_email_send_failed", businessId, {}, "error");
  }
}

export type AppointmentStatusForEmail = "confirmed" | "declined" | "cancelled";

const STATUS_EMAIL_SUBJECT: Record<AppointmentStatusForEmail, (businessName: string) => string> = {
  confirmed: (businessName) => `Your appointment with ${businessName} is confirmed`,
  declined: (businessName) => `Your appointment request with ${businessName} couldn't be confirmed`,
  cancelled: (businessName) => `Your appointment with ${businessName} was cancelled`,
};

const STATUS_EMAIL_HEADING: Record<AppointmentStatusForEmail, string> = {
  confirmed: "Your appointment is confirmed",
  declined: "We couldn't confirm that time",
  cancelled: "Your appointment was cancelled",
};

// Two variants of each body: the "reply to this email" wording is only used
// when a reply will actually reach the business (it has a contact_email to
// route replyTo at). Otherwise the copy falls back to the original neutral
// "get back in touch" -- promising a reply path that doesn't exist would be
// worse than the old behaviour.
const STATUS_EMAIL_BODY: Record<AppointmentStatusForEmail, { canReply: string; cannotReply: string }> = {
  confirmed: {
    canReply: "We look forward to speaking with you. If anything changes, just reply to this email.",
    cannotReply: "We look forward to speaking with you.",
  },
  declined: {
    canReply: "Unfortunately we couldn't confirm your requested time. Reply to this email to find another one.",
    cannotReply: "Unfortunately we couldn't confirm your requested time. Please get back in touch to find another one.",
  },
  cancelled: {
    canReply: "If you'd like to reschedule, just reply to this email.",
    cannotReply: "Please get back in touch if you'd like to reschedule.",
  },
};

/**
 * Reply to the prospect once the business confirms/declines/cancels an
 * appointment they booked. `to` is the appointment's own `contact_email`,
 * passed by the caller since it's already tenant-validated at that point.
 *
 * **Prospect-facing**: sent "<Business> via Waves AI Pilot" with `replyTo`
 * set to the business's `contact_email`. The declined and cancelled bodies
 * explicitly ask the prospect to reply, so without `replyTo` the one
 * response this email exists to prompt went nowhere.
 */
export async function sendAppointmentStatusEmail(
  businessId: string,
  to: string,
  status: AppointmentStatusForEmail,
  label: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    logEvent("appointment_status_email_skipped_no_api_key", businessId, { status });
    return;
  }

  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("name, contact_email").eq("id", businessId).maybeSingle();
  const businessName = business?.name ?? "the business";
  const replyTo = business?.contact_email ?? null;

  const outcome = await sendEmail({
    to,
    subject: STATUS_EMAIL_SUBJECT[status](businessName),
    onBehalfOf: businessName,
    replyTo,
    email: renderBrandedEmail({
      senderName: businessName,
      heading: STATUS_EMAIL_HEADING[status],
      paragraphs: [replyTo ? STATUS_EMAIL_BODY[status].canReply : STATUS_EMAIL_BODY[status].cannotReply],
      facts: [
        { label: "With", value: businessName },
        { label: "When", value: label },
      ],
      footnote: replyTo
        ? `Sent on behalf of ${businessName} by Waves AI Pilot. Replies go straight to ${businessName}.`
        : `Sent on behalf of ${businessName} by Waves AI Pilot.`,
    }),
  });

  if (outcome === "sent") {
    logEvent("appointment_status_email_sent", businessId, { status });
  } else if (outcome === "suppressed") {
    logEvent("appointment_status_email_suppressed", businessId, { status });
  } else if (outcome === "failed") {
    logEvent("appointment_status_email_send_failed", businessId, { status }, "error");
  }
}
