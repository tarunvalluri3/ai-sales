import "server-only";
import { Resend } from "resend";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BUSINESSES_PER_RUN = 200;

const DEFAULT_FROM = "AI Sales <onboarding@resend.dev>";

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
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .gte("created_at", cutoffIso),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("needs_attention", true),
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
        `Here's your daily AI Sales summary for ${business.name}:`,
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
