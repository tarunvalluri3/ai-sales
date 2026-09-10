import "server-only";
import { Resend } from "resend";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BUSINESSES_PER_RUN = 200;

const DEFAULT_FROM = "Waves AI Pilot <onboarding@resend.dev>";

/**
 * Same null-safe sandbox exclusion as lib/conversations.ts's own
 * EXCLUDE_SANDBOX_FILTER -- a business owner's own sandbox testing must
 * never trigger a "you have a new lead" / "needs attention" email about
 * itself.
 */
const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;

export type NotificationDigestResult = { sent: number; skipped: number; failed: number };

/**
 * Daily handoff/lead email digest (Phase 25b) -- part of the shared
 * daily cron backstop (app/api/cron/process-ingestion-queue/route.ts),
 * same "no dedicated worker, no notification-specific trigger" reasoning
 * as lib/sla-routing.ts's own sweep. For every business with a
 * `contact_email` set, sends one email summarizing new leads in the
 * last 24h and conversations currently needing attention -- skipped
 * entirely (not sent) when both are zero, so a quiet business never
 * gets an empty digest.
 *
 * Recipient is `businesses.contact_email` -- the only business-level
 * email address this app collects (Phase 13b), not a dedicated
 * "notify these staff" list. **Known limitation**: this conflates "how
 * a prospect reaches the business" with "who gets operational alerts."
 * A dedicated staff-notification-recipients field is a reasonable
 * follow-up, not built here to keep this sub-phase's scope bounded.
 *
 * A silent no-op (one log line, not an error) when `RESEND_API_KEY` is
 * unset -- matches `lib/env.ts`'s optional-variable convention (docs/security.md
 * §5): email delivery is additive on top of the in-app "needs
 * attention" badge and audit trail, not a path anything else depends
 * on. A single business's send failure never blocks another's.
 */
export async function sendDailyDigestEmails(): Promise<NotificationDigestResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logEvent("notification_digest_skipped_no_api_key", "unknown");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const resend = new Resend(apiKey);
  const from = process.env.NOTIFICATION_EMAIL_FROM || DEFAULT_FROM;
  const supabase = createServiceSupabaseClient();

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

      const lines = [
        `Here's your daily Waves AI Pilot summary for ${business.name}:`,
        "",
        `- New leads in the last 24 hours: ${leads}`,
        `- Conversations needing attention right now: ${needsAttention}`,
        "",
        "Open your dashboard to review: https://ai-sales.vercel.app/dashboard",
      ];

      const { error: sendError } = await resend.emails.send({
        from,
        to: business.contact_email,
        subject,
        text: lines.join("\n"),
      });

      if (sendError) {
        failed++;
        logEvent("notification_digest_send_failed", business.id, {}, "error");
        continue;
      }

      sent++;
    } catch {
      failed++;
      logEvent("notification_digest_send_failed", business.id, {}, "error");
    }
  }

  return { sent, skipped, failed };
}

/**
 * Immediate admin alert for a brand-new pending appointment request
 * (2026-09-10 follow-up to Phase C) -- unlike the daily digest above,
 * this fires right when the AI's book_appointment tool creates the row,
 * so a business doesn't have to wait until the next day to learn a
 * prospect is waiting on a confirmation. Same recipient
 * (`businesses.contact_email`), same silent-no-op-if-unconfigured
 * contract, same never-throws shape -- a failed send here must never
 * turn a successful booking into an error response.
 */
export async function sendNewAppointmentRequestEmail(
  businessId: string,
  appointment: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; label: string },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logEvent("appointment_request_email_skipped_no_api_key", businessId);
    return;
  }

  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("name, contact_email").eq("id", businessId).maybeSingle();
  if (!business?.contact_email) {
    logEvent("appointment_request_email_skipped_no_contact_email", businessId);
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.NOTIFICATION_EMAIL_FROM || DEFAULT_FROM;

  const lines = [
    `A new appointment request just came in for ${business.name}:`,
    "",
    `- When: ${appointment.label}`,
    `- Name: ${appointment.contactName ?? "Not given"}`,
    `- Email: ${appointment.contactEmail ?? "Not given"}`,
    `- Phone: ${appointment.contactPhone ?? "Not given"}`,
    "",
    "Confirm or decline it here: https://ai-sales.vercel.app/dashboard/appointments",
  ];

  try {
    const { error } = await resend.emails.send({
      from,
      to: business.contact_email,
      subject: `New appointment request — ${business.name}`,
      text: lines.join("\n"),
    });

    if (error) {
      logEvent("appointment_request_email_send_failed", businessId, {}, "error");
      return;
    }
    logEvent("appointment_request_email_sent", businessId);
  } catch {
    logEvent("appointment_request_email_send_failed", businessId, {}, "error");
  }
}

export type AppointmentStatusForEmail = "confirmed" | "declined" | "cancelled";

const STATUS_EMAIL_SUBJECT: Record<AppointmentStatusForEmail, (businessName: string) => string> = {
  confirmed: (businessName) => `Your appointment with ${businessName} is confirmed`,
  declined: (businessName) => `Your appointment request with ${businessName} couldn't be confirmed`,
  cancelled: (businessName) => `Your appointment with ${businessName} was cancelled`,
};

const STATUS_EMAIL_BODY: Record<AppointmentStatusForEmail, (label: string) => string> = {
  confirmed: (label) => `Your appointment for ${label} is confirmed. We look forward to speaking with you.`,
  declined: (label) =>
    `Unfortunately we couldn't confirm your requested appointment for ${label}. Please get back in touch to find another time.`,
  cancelled: (label) => `Your appointment for ${label} has been cancelled. Please get back in touch if you'd like to reschedule.`,
};

/**
 * Reply to the prospect once the business confirms/declines/cancels an
 * appointment they booked (2026-09-10 follow-up to Phase C) -- until now
 * `app/(dashboard)/dashboard/appointments/actions.ts` only ever flipped
 * the row's status with no reply of any kind. `to` is the appointment's
 * own `contact_email`, passed by the caller rather than looked up here
 * since it's already tenant-validated at that point. Same silent-no-op-
 * if-unconfigured and never-throws contract as every other sender in
 * this file.
 */
export async function sendAppointmentStatusEmail(
  businessId: string,
  to: string,
  status: AppointmentStatusForEmail,
  label: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logEvent("appointment_status_email_skipped_no_api_key", businessId, { status });
    return;
  }

  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();
  const businessName = business?.name ?? "the business";

  const resend = new Resend(apiKey);
  const from = process.env.NOTIFICATION_EMAIL_FROM || DEFAULT_FROM;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: STATUS_EMAIL_SUBJECT[status](businessName),
      text: STATUS_EMAIL_BODY[status](label),
    });

    if (error) {
      logEvent("appointment_status_email_send_failed", businessId, { status }, "error");
      return;
    }
    logEvent("appointment_status_email_sent", businessId, { status });
  } catch {
    logEvent("appointment_status_email_send_failed", businessId, { status }, "error");
  }
}
