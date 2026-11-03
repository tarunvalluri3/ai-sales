import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";
import { processWhatsappOutboundMessages } from "@/lib/whatsapp-delivery";
import { processInstagramOutboundMessages } from "@/lib/instagram-delivery";
import { refreshDueUrlKnowledgeSources } from "@/lib/url-ingestion";
import { runSlaEscalationSweep } from "@/lib/sla-routing";
import { sendDailyDigestEmails } from "@/lib/notifications";
import { runStalledLeadFollowUpSweep } from "@/lib/stalled-leads";
import { processWorkflowRuns, runNoActivityWorkflowSweep } from "@/lib/workflow-engine";
import { runBillingLifecycleSweep } from "@/lib/billing-lifecycle";
import { processAnswerBankJobs } from "@/lib/answer-bank/generate";
import { computeDailyRollup } from "@/lib/analytics-rollup";
import { recoverStuckInboundReplies } from "@/lib/inbound-reply-recovery";
import { runAppointmentLifecycleSweep } from "@/lib/appointment-lifecycle";
import { processPendingBillingCancellations } from "@/lib/billing-cancellation";
import { runInstagramConnectionHealthCheck } from "@/lib/instagram-health";
import type { ScheduledJob } from "@/lib/scheduler/runner";

/**
 * Every background job, with how often it may run (production readiness,
 * item 3). The trigger -- a VPS crontab every 1-2 minutes (docs/vps-cron.md),
 * the daily Vercel Cron, or a manual call -- just calls /api/cron/run; each
 * job then runs only when its own schedule says so.
 *
 * Every job here is safe to run repeatedly:
 *  - the queues claim rows atomically (for update skip locked) and back off;
 *  - the time-based sweeps are deduped by their own state (stalled leads:
 *    follow_up_sent_at; billing: billing_notice_sends; no-activity workflows:
 *    recent workflow_runs; SLA: sla_escalated_at; URL refresh: last_refreshed_at);
 *  - the once-a-day jobs (digest email, stalled-lead follow-ups, analytics
 *    rollup) keep the old 04:00 UTC (09:30 IST) slot and run once per day
 *    however often the trigger fires.
 *
 * Timeouts are under the 60 s maxDuration of the cron routes so a run on
 * Vercel ends cleanly; on a VPS nothing kills the request, so the timeout is
 * the only bound.
 */

const MINUTE = 60;
const DAILY_0400_UTC = { kind: "daily", utcHour: 4, utcMinute: 0 } as const;

/** Rows a dead instance left in 'processing' go back to 'pending' after 15 minutes. */
export async function releaseStaleQueueClaims(): Promise<Record<string, number>> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("release_stale_queue_claims", { p_stale_seconds: 15 * MINUTE });
  if (error) throw new Error(`release_stale_queue_claims failed (${error.code ?? "unknown"})`);
  const released: Record<string, number> = {};
  for (const row of (data ?? []) as { queue: string; released: number }[]) released[row.queue] = row.released;
  return released;
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  // Queues: drain every tick.
  { name: "knowledge_ingestion", schedule: { kind: "every", seconds: MINUTE }, timeoutMs: 50_000, run: processIngestionQueue },
  { name: "webhook_deliveries", schedule: { kind: "every", seconds: MINUTE }, timeoutMs: 40_000, run: processWebhookDeliveries },
  { name: "whatsapp_outbound", schedule: { kind: "every", seconds: MINUTE }, timeoutMs: 40_000, run: processWhatsappOutboundMessages },
  { name: "instagram_outbound", schedule: { kind: "every", seconds: MINUTE }, timeoutMs: 40_000, run: processInstagramOutboundMessages },
  { name: "workflow_runs", schedule: { kind: "every", seconds: MINUTE }, timeoutMs: 40_000, run: processWorkflowRuns },
  { name: "inbound_reply_recovery", schedule: { kind: "every", seconds: 2 * MINUTE }, timeoutMs: 40_000, run: recoverStuckInboundReplies },
  { name: "release_stale_claims", schedule: { kind: "every", seconds: 5 * MINUTE }, timeoutMs: 20_000, run: releaseStaleQueueClaims },
  { name: "answer_bank", schedule: { kind: "every", seconds: 5 * MINUTE }, timeoutMs: 50_000, run: processAnswerBankJobs },
  // Time-based sweeps, deduped by their own state.
  { name: "sla_escalation", schedule: { kind: "every", seconds: 5 * MINUTE }, timeoutMs: 40_000, run: runSlaEscalationSweep },
  // Reminders (24 h / 1 h) and expiry of unconfirmed bookings; each notice is
  // deduped by appointment_notifications, so a retry never sends it twice.
  { name: "appointment_lifecycle", schedule: { kind: "every", seconds: 5 * MINUTE }, timeoutMs: 50_000, run: () => runAppointmentLifecycleSweep() },
  { name: "url_refresh", schedule: { kind: "every", seconds: 15 * MINUTE }, timeoutMs: 55_000, retries: 0, run: refreshDueUrlKnowledgeSources },
  { name: "no_activity_workflows", schedule: { kind: "every", seconds: 15 * MINUTE }, timeoutMs: 40_000, run: runNoActivityWorkflowSweep },
  // Dead Instagram tokens / removed Page subscriptions, found before a DM goes unanswered.
  { name: "instagram_health", schedule: { kind: "every", seconds: 6 * 60 * MINUTE }, timeoutMs: 50_000, run: runInstagramConnectionHealthCheck },
  { name: "billing_lifecycle", schedule: { kind: "every", seconds: 60 * MINUTE }, timeoutMs: 50_000, run: () => runBillingLifecycleSweep() },
  // Deleted businesses whose Razorpay subscription is not confirmed cancelled
  // yet (each row has its own backoff; alerts on first failure and give-up).
  { name: "billing_cancellations", schedule: { kind: "every", seconds: 15 * MINUTE }, timeoutMs: 50_000, run: processPendingBillingCancellations },
  // Once a day, same slot as the old daily Vercel cron. The digest has no
  // per-business "already sent today" record, so it is at most once a day
  // and never retried (a timeout means some businesses miss one digest,
  // never that some get two). The other two are idempotent (follow_up_sent_at;
  // an upsert keyed by business + date), so they retry until they succeed.
  { name: "daily_digest", schedule: DAILY_0400_UTC, timeoutMs: 50_000, retries: 0, run: sendDailyDigestEmails },
  {
    name: "stalled_lead_follow_up",
    schedule: { ...DAILY_0400_UTC, retryFailedSameDay: true },
    timeoutMs: 50_000,
    run: runStalledLeadFollowUpSweep,
  },
  { name: "analytics_rollup", schedule: { ...DAILY_0400_UTC, retryFailedSameDay: true }, timeoutMs: 50_000, run: computeDailyRollup },
];

export const SCHEDULED_JOB_NAMES = SCHEDULED_JOBS.map((job) => job.name);
