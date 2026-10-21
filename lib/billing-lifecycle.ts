import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { recordSystemAuditLogEntry } from "@/lib/audit-log";
import { PAST_DUE_GRACE_DAYS } from "@/lib/plans";
import { readBillingSubscription, sendBillingNotice, updateBillingSubscription } from "@/lib/billing-store";
import type { BillingSubscriptionRow } from "@/lib/razorpay-webhook";
import { SUBSCRIPTION_STATUSES } from "@/lib/subscription";

/**
 * The once-a-day billing sweep. Phase 17b (STATE.md).
 *
 * **Folded into the existing daily cron** (`Promise.all` in
 * app/api/cron/process-ingestion-queue/route.ts) rather than given a cron
 * job of its own, deliberately: Vercel's Hobby plan caps cron jobs and
 * limits each to once a day, which is why that one route already sweeps
 * every queue in this app. A second cron entry would have been the first
 * thing to break on deploy.
 *
 * Four things only a clock can notice, because no webhook fires for the
 * passage of time:
 *
 * 1. **A grace period running out.** Razorpay's `subscription.halted`
 *    usually gets there first, but it is the provider's retry schedule and
 *    not our 5-day promise, so the deadline is also enforced here.
 * 2. **An annual term coming up.** Annual is a one-time order, so nothing
 *    renews itself and the reminder email is the only thing between a
 *    customer and a stopped AI.
 * 3. **A trial ending with no payment method.** Rare, since a payment
 *    method is required at signup, but a customer who abandoned checkout
 *    should hear about it rather than just stop.
 * 4. **A finished term that is still marked `cancelled` or `active`.**
 *    The entitlement logic already stops serving on the date; this moves
 *    the stored status to `expired` so the dashboard, the audit trail and
 *    the row itself agree with what the customer is actually getting.
 *
 * Every email goes through `sendBillingNotice`, which claims a row in
 * `public.billing_notice_sends` before sending -- so this running twice in
 * a day, or running again after a partial failure, sends nothing twice.
 *
 * Never throws: it is one branch of a `Promise.all` that also sweeps
 * ingestion, webhooks, WhatsApp and workflows, and a billing read failure
 * must not take those down with it.
 */

export type BillingSweepResult = {
  examined: number;
  graceLapsed: number;
  expired: number;
  renewalRemindersSent: number;
  trialRemindersSent: number;
  failed: number;
};

/** 14 and 3 days out, matching the two annual_renewal_* notice kinds. */
const ANNUAL_REMINDER_DAYS = [14, 3] as const;
/** One reminder for an abandoned trial, 3 days before it ends. */
const TRIAL_REMINDER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(iso: string, now: Date): number {
  return (new Date(iso).getTime() - now.getTime()) / DAY_MS;
}

/**
 * The moment the 5-day grace actually expires: never before the end of the
 * period the customer already paid for, and anchored to the first failed
 * payment rather than re-stamped on each Razorpay retry. The same rule
 * `entitlementFromRow` applies, kept in step with it on purpose -- if
 * these two disagreed, a business's AI would stop on one date and its
 * status would change on another.
 */
function graceEndMs(row: BillingSubscriptionRow): number | null {
  if (!row.past_due_since && !row.current_period_end) return null;
  const periodEndMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
  const failureEndMs = row.past_due_since
    ? new Date(row.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * DAY_MS
    : null;
  if (failureEndMs === null) return periodEndMs === null ? null : periodEndMs + PAST_DUE_GRACE_DAYS * DAY_MS;
  return periodEndMs === null ? failureEndMs : Math.max(periodEndMs, failureEndMs);
}

export async function runBillingLifecycleSweep(now: Date = new Date()): Promise<BillingSweepResult> {
  const result: BillingSweepResult = {
    examined: 0,
    graceLapsed: 0,
    expired: 0,
    renewalRemindersSent: 0,
    trialRemindersSent: 0,
    failed: 0,
  };

  const supabase = createServiceSupabaseClient();

  // One row per business, and `expired` rows are terminal with nothing left
  // to do, so this reads only the live ones. No pagination: the row count
  // is the tenant count, which is the smallest table in this schema --
  // revisit if that ever stops being true.
  const liveStatuses = SUBSCRIPTION_STATUSES.filter((status) => status !== "expired");
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "business_id, plan_key, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, scheduled_plan_key, past_due_since, billing_interval, razorpay_subscription_id, razorpay_customer_id, razorpay_order_id",
    )
    .in("status", liveStatuses);

  if (error) {
    logEvent("billing_sweep_read_failed", "unknown", {}, "error");
    result.failed += 1;
    return result;
  }

  for (const raw of data ?? []) {
    const row = raw as BillingSubscriptionRow;
    result.examined += 1;
    try {
      await sweepOne(supabase, row, now, result);
    } catch {
      // One tenant's billing problem must not stop the rest of the sweep.
      logEvent("billing_sweep_row_failed", row.business_id, { status: row.status }, "error");
      result.failed += 1;
    }
  }

  logEvent("billing_sweep_complete", "unknown", { ...result });
  return result;
}

async function sweepOne(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  row: BillingSubscriptionRow,
  now: Date,
  result: BillingSweepResult,
): Promise<void> {
  const nowMs = now.getTime();

  /* 1. A grace period that has run out. */
  if (row.status === "past_due") {
    const endMs = graceEndMs(row);
    if (endMs !== null && nowMs > endMs) {
      await updateBillingSubscription(supabase, row.business_id, { status: "expired" });
      await recordSystemAuditLogEntry(row.business_id, "subscription.grace_lapsed", "subscription", row.business_id, {
        planKey: row.plan_key,
        trigger: "grace_period_expired",
        pastDueSince: row.past_due_since,
      });
      await sendBillingNotice(supabase, "grace_lapsed", row, {
        periodEndIso: row.past_due_since ?? new Date(endMs).toISOString(),
        planKey: row.plan_key,
      });
      logEvent("billing_grace_lapsed", row.business_id, { planKey: row.plan_key }, "error");
      result.graceLapsed += 1;
    }
    return;
  }

  /* 2. A trial that ended. */
  if (row.status === "trialing") {
    if (row.trial_ends_at) {
      const days = daysUntil(row.trial_ends_at, now);
      if (days < 0) {
        // The entitlement logic already stopped serving on the date; this
        // makes the stored status say so too. A trial that converted would
        // have been moved to `active` by subscription.charged, so a
        // trialing row past its end never paid.
        await updateBillingSubscription(supabase, row.business_id, { status: "expired" });
        await recordSystemAuditLogEntry(row.business_id, "subscription.expired", "subscription", row.business_id, {
          planKey: row.plan_key,
          trigger: "trial_ended_unconverted",
          hadPaymentMethod: row.razorpay_subscription_id !== null,
        });
        logEvent("billing_trial_expired", row.business_id, {
          planKey: row.plan_key,
          hadPaymentMethod: row.razorpay_subscription_id !== null,
        });
        result.expired += 1;
        return;
      }

      // Only a trial with no mandate at all needs warning: one that has
      // authorised a payment method is about to convert on its own, and
      // telling that customer their trial is "ending" would be alarming
      // and wrong.
      const hasPaymentMethod = row.razorpay_subscription_id !== null || row.razorpay_order_id !== null;
      if (!hasPaymentMethod && days <= TRIAL_REMINDER_DAYS) {
        await sendBillingNotice(supabase, "trial_ending_3d", row, {
          periodEndIso: row.trial_ends_at,
          planKey: row.plan_key,
        });
        result.trialRemindersSent += 1;
      }
    }
    return;
  }

  /* 3. An annual term coming up, and 4. a finished period. */
  if (!row.current_period_end) return;
  const periodEndMs = new Date(row.current_period_end).getTime();

  if (row.status === "cancelled") {
    if (nowMs > periodEndMs) {
      await updateBillingSubscription(supabase, row.business_id, { status: "expired" });
      await recordSystemAuditLogEntry(row.business_id, "subscription.expired", "subscription", row.business_id, {
        planKey: row.plan_key,
        trigger: "cancelled_period_ended",
      });
      logEvent("billing_cancelled_period_ended", row.business_id, { planKey: row.plan_key });
      result.expired += 1;
    }
    return;
  }

  // status === 'active'
  if (row.billing_interval === "annual") {
    const days = daysUntil(row.current_period_end, now);

    if (days < -PAST_DUE_GRACE_DAYS) {
      // The term ended, the 5-day grace we give every lapse has passed, and
      // no renewal order was paid. An annual customer is never charged
      // automatically, so this is the designed end state rather than a
      // failure: the AI stops the same way an exhausted quota does, and the
      // business has already had two reminder emails plus the lapse notice.
      await updateBillingSubscription(supabase, row.business_id, { status: "expired" });
      await recordSystemAuditLogEntry(row.business_id, "subscription.expired", "subscription", row.business_id, {
        planKey: row.plan_key,
        trigger: "annual_term_not_renewed",
      });
      await sendBillingNotice(supabase, "grace_lapsed", row, {
        periodEndIso: row.current_period_end,
        planKey: row.plan_key,
      });
      logEvent("billing_annual_term_expired", row.business_id, { planKey: row.plan_key }, "error");
      result.expired += 1;
      return;
    }

    for (const threshold of ANNUAL_REMINDER_DAYS) {
      if (days > 0 && days <= threshold) {
        await sendBillingNotice(
          supabase,
          threshold === 14 ? "annual_renewal_14d" : "annual_renewal_3d",
          row,
          { periodEndIso: row.current_period_end, planKey: row.plan_key },
        );
        result.renewalRemindersSent += 1;
        // Only the nearest threshold that applies: inside 3 days both are
        // true, and the 14-day notice is a strictly weaker statement of the
        // same fact. The ledger would dedupe a repeat anyway, but sending
        // the 14-day email three days out would read as a mistake.
        break;
      }
    }
    return;
  }

  // A monthly subscription whose period end has passed well beyond the
  // grace, with no charge event -- i.e. Razorpay stopped telling us
  // anything. Not expired automatically: a missing webhook is our problem,
  // not the customer's, and 17a's entitlement logic already declines to
  // serve past the grace. Logged loudly so it is visible in Sentry.
  if (nowMs > periodEndMs + PAST_DUE_GRACE_DAYS * DAY_MS) {
    logEvent(
      "billing_monthly_period_overdue_no_webhook",
      row.business_id,
      { planKey: row.plan_key, periodEnd: row.current_period_end },
      "error",
    );
  }
}

/**
 * Reads one business's row for the billing page's "is anything scheduled?"
 * questions that the entitlement does not answer. Re-exported here so the
 * page has one import for lifecycle concerns.
 */
export { readBillingSubscription };
