import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { cancelSubscription, fetchSubscription, isRazorpayConfigured } from "@/lib/razorpay";
import { sendEmail } from "@/lib/email-sender";
import { renderBrandedEmail } from "@/lib/email-template";
import { logEvent } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import {
  classifyDeletedBusinessEvent,
  isTerminalRazorpayStatus,
  needsCancellationOnDelete,
  nextCancellationState,
} from "@/lib/billing-cancellation-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Cancelling a deleted business's Razorpay subscription (production
 * readiness, item 6; LAUNCH_AUDIT.md §9 "deleting a business does not cancel
 * its Razorpay subscription").
 *
 *  1. Before the business row is deleted, recordCancellationForDeletion()
 *     writes a public.billing_cancellations row (no FK, so it survives the
 *     cascade) and tries the cancellation inline. If the record itself can't
 *     be written, the deletion is refused -- we never delete a business we
 *     can't guarantee to stop charging.
 *  2. A failed cancellation stays `pending` and the scheduler retries it with
 *     backoff (processPendingBillingCancellations, every 15 minutes). After a
 *     failed cancel we ask Razorpay for the subscription's real status, so an
 *     "already cancelled" refusal counts as done.
 *  3. Alerts: the first failure and running out of retries each log an
 *     error-level `billing_cancellation_failed` / `billing_cancellation_gave_up`
 *     (Sentry) and, if OPS_ALERT_EMAIL is set, email it.
 *  4. Webhooks that arrive after the deletion (handleDeletedBusinessEvent,
 *     wired into lib/billing-store.ts): a `subscription.charged` is money a
 *     deleted customer paid -- alerted immediately and the cancellation is
 *     retried at once; refunding it is a manual decision. A
 *     `subscription.cancelled`/`completed` confirms the row.
 */

const MAX_PER_RUN = 20;

type CancellationRow = {
  id: string;
  business_id: string;
  clerk_org_id: string;
  business_name: string | null;
  razorpay_subscription_id: string;
  razorpay_customer_id: string | null;
  reason: CancellationReason;
  status: "pending" | "cancelled" | "failed";
  attempts: number;
  charges_after_deletion: number;
  created_at: string;
};

const ROW_COLUMNS =
  "id, business_id, clerk_org_id, business_name, razorpay_subscription_id, razorpay_customer_id, reason, status, attempts, charges_after_deletion, created_at";

export type DeletionBillingOutcome = "nothing_to_cancel" | "cancelled" | "pending_retry";

/**
 * Why the business stopped being a customer. The owner's own delete and both
 * platform-admin deletes (/apache soft-delete and hard-delete) share this one
 * path: record, cancel immediately, retry with backoff, alert.
 */
export type CancellationReason = "business_deleted" | "admin_soft_deleted" | "admin_hard_deleted";

/**
 * The owner's delete. Call immediately BEFORE deleting the business. Throws
 * (refusing the deletion) only if the durable record can't be written.
 */
export async function recordCancellationForDeletion(orgId: string): Promise<DeletionBillingOutcome> {
  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, clerk_org_id")
    .eq("clerk_org_id", orgId)
    .maybeSingle<{ id: string; name: string; clerk_org_id: string }>();
  if (!business) return "nothing_to_cancel";
  return recordCancellation(supabase, business, "business_deleted");
}

/**
 * A platform-admin delete (/apache). Same path as the owner's: call BEFORE
 * soft- or hard-deleting; throws (refusing the delete) only if the durable
 * record can't be written.
 */
export async function recordCancellationForAdminDeletion(
  businessId: string,
  reason: Extract<CancellationReason, "admin_soft_deleted" | "admin_hard_deleted">,
): Promise<DeletionBillingOutcome> {
  const supabase = createServiceSupabaseClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, clerk_org_id")
    .eq("id", businessId)
    .maybeSingle<{ id: string; name: string; clerk_org_id: string }>();
  if (!business) return "nothing_to_cancel";
  return recordCancellation(supabase, business, reason);
}

async function recordCancellation(
  supabase: ServiceSupabaseClient,
  business: { id: string; name: string; clerk_org_id: string },
  reason: CancellationReason,
): Promise<DeletionBillingOutcome> {
  const orgId = business.clerk_org_id;

  const { data: subscription, error: readError } = await supabase
    .from("subscriptions")
    .select("razorpay_subscription_id, razorpay_customer_id, status")
    .eq("business_id", business.id)
    .maybeSingle<{ razorpay_subscription_id: string | null; razorpay_customer_id: string | null; status: string }>();
  if (readError) {
    throw new AppError(
      "We couldn't check your subscription before deleting. Nothing was deleted -- please try again.",
      "recordCancellationForDeletion: subscription read failed",
      readError,
    );
  }
  if (!needsCancellationOnDelete(subscription)) return "nothing_to_cancel";

  const { data: row, error: writeError } = await supabase
    .from("billing_cancellations")
    .upsert(
      {
        business_id: business.id,
        clerk_org_id: orgId,
        business_name: business.name,
        razorpay_subscription_id: subscription!.razorpay_subscription_id!,
        razorpay_customer_id: subscription!.razorpay_customer_id,
        reason,
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "razorpay_subscription_id" },
    )
    .select(ROW_COLUMNS)
    .single<CancellationRow>();
  if (writeError || !row) {
    throw new AppError(
      "We couldn't safely cancel your subscription, so nothing was deleted. Please try again or contact us.",
      "recordCancellationForDeletion: billing_cancellations write failed",
      writeError,
    );
  }

  const status = await attemptCancellation(supabase, row);
  return status === "cancelled" ? "cancelled" : "pending_retry";
}

/** One cancellation attempt. Never throws; records the outcome on the row. */
async function attemptCancellation(supabase: ServiceSupabaseClient, row: CancellationRow): Promise<CancellationRow["status"]> {
  let confirmedTerminal = false;
  let lastError: string | null = null;

  if (!isRazorpayConfigured()) {
    lastError = "razorpay_not_configured";
  } else {
    try {
      // Immediate, not at cycle end (decision recorded in billing-cancellation-rules.ts).
      const cancelled = await cancelSubscription(row.razorpay_subscription_id, false, row.business_id);
      confirmedTerminal = isTerminalRazorpayStatus(cancelled?.status);
      if (!confirmedTerminal) lastError = `unexpected_status:${cancelled?.status ?? "unparseable"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 300) : "cancel_failed";
    }
    if (!confirmedTerminal) {
      // "Already cancelled" comes back as an error; ask for the real state.
      try {
        const current = await fetchSubscription(row.razorpay_subscription_id);
        confirmedTerminal = isTerminalRazorpayStatus(current?.status);
      } catch {
        // Keep the original error.
      }
    }
  }

  const next = nextCancellationState(row.attempts, confirmedTerminal);
  const nowIso = new Date().toISOString();
  await supabase
    .from("billing_cancellations")
    .update(
      next.status === "cancelled"
        ? { status: "cancelled", cancelled_at: nowIso, last_error: null, updated_at: nowIso, attempts: row.attempts + 1 }
        : {
            status: next.status,
            attempts: row.attempts + 1,
            last_error: lastError,
            next_attempt_at:
              next.status === "pending" ? new Date(Date.now() + next.nextAttemptInSeconds * 1000).toISOString() : nowIso,
            updated_at: nowIso,
          },
    )
    .eq("id", row.id);

  if (next.status === "cancelled") {
    logEvent("billing_cancellation_succeeded", row.business_id, { cancellationId: row.id, attempts: row.attempts + 1 });
  } else if (next.alert) {
    const gaveUp = next.status === "failed";
    const event = gaveUp ? "billing_cancellation_gave_up" : "billing_cancellation_failed";
    logEvent(event, row.business_id, { cancellationId: row.id, attempts: row.attempts + 1, error: lastError }, "error");
    await alertOps(
      gaveUp ? "ACTION NEEDED: a deleted customer's Razorpay subscription could not be cancelled" : "A deleted customer's Razorpay subscription is not cancelled yet",
      [
        gaveUp
          ? `Automatic cancellation failed ${row.attempts + 1} times and has stopped. Cancel it by hand in the Razorpay dashboard.`
          : "The first automatic cancellation failed. It will be retried automatically; you'll get another email if it keeps failing.",
      ],
      row,
      lastError,
    );
  } else {
    logEvent("billing_cancellation_retry_scheduled", row.business_id, { cancellationId: row.id, attempts: row.attempts + 1 });
  }
  return next.status;
}

export type BillingCancellationSweepResult = { processed: number; cancelled: number; stillPending: number; failed: number };

/** Scheduler job: retries due pending cancellations. Never throws. */
export async function processPendingBillingCancellations(): Promise<BillingCancellationSweepResult> {
  const supabase = createServiceSupabaseClient();
  const result: BillingCancellationSweepResult = { processed: 0, cancelled: 0, stillPending: 0, failed: 0 };
  const { data, error } = await supabase
    .from("billing_cancellations")
    .select(ROW_COLUMNS)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) {
    logEvent("billing_cancellation_read_failed", "unknown", {}, "error");
    return result;
  }
  for (const row of (data ?? []) as CancellationRow[]) {
    result.processed++;
    const status = await attemptCancellation(supabase, row);
    if (status === "cancelled") result.cancelled++;
    else if (status === "failed") result.failed++;
    else result.stillPending++;
  }
  return result;
}

/**
 * A verified Razorpay event for a subscription whose business no longer
 * exists. Returns true if the subscription belongs to a deleted business
 * (so the webhook acknowledges it as handled), false otherwise.
 */
export async function handleDeletedBusinessEvent(
  supabase: ServiceSupabaseClient,
  razorpaySubscriptionId: string,
  event: string,
  payment: { id: string | null; amountPaise: number | null },
): Promise<boolean> {
  const { data: row } = await supabase
    .from("billing_cancellations")
    .select(ROW_COLUMNS)
    .eq("razorpay_subscription_id", razorpaySubscriptionId)
    .maybeSingle<CancellationRow>();
  if (!row) return false;

  const action = classifyDeletedBusinessEvent(event);
  const nowIso = new Date().toISOString();

  if (action === "confirm_cancelled") {
    await supabase
      .from("billing_cancellations")
      .update({ status: "cancelled", cancelled_at: nowIso, updated_at: nowIso })
      .eq("id", row.id);
    logEvent("billing_cancellation_confirmed_by_webhook", row.business_id, { cancellationId: row.id, event });
    return true;
  }

  if (action === "charge_after_deletion") {
    const amountInr = payment.amountPaise !== null ? (payment.amountPaise / 100).toFixed(2) : null;
    await supabase
      .from("billing_cancellations")
      .update({
        charges_after_deletion: row.charges_after_deletion + 1,
        last_charge_payment_id: payment.id,
        // Retry the cancellation on the next scheduler run, whatever state it was in.
        status: "pending",
        next_attempt_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", row.id);
    logEvent(
      "billing_charge_after_deletion",
      row.business_id,
      { cancellationId: row.id, paymentId: payment.id, amountPaise: payment.amountPaise, reason: row.reason },
      "error",
    );
    // Never refunded automatically (owner decision 2026-11-03): the email
    // carries everything needed to review and refund by hand.
    await alertOps(
      "ACTION NEEDED: a deleted customer was charged",
      [
        "Razorpay charged a subscription that belongs to a business that has been deleted. Nothing has been refunded automatically.",
        "The cancellation is being retried now. To refund: Razorpay Dashboard > Transactions > Payments > search the payment id below > Issue Refund. The refund.processed webhook then issues the GST credit note.",
      ],
      row,
      null,
      [
        { label: "Payment id", value: payment.id ?? "unknown (see Razorpay)" },
        { label: "Amount (INR)", value: amountInr ?? "unknown" },
        { label: "Charges since deletion", value: String(row.charges_after_deletion + 1) },
      ],
    );
    return true;
  }

  logEvent("billing_event_for_deleted_business", row.business_id, { cancellationId: row.id, event: event.slice(0, 64) });
  return true;
}

/** Error-level event always (Sentry); email too when OPS_ALERT_EMAIL is set. Never throws. */
async function alertOps(
  subject: string,
  paragraphs: string[],
  row: CancellationRow,
  detail: string | null,
  extraFacts: { label: string; value: string }[] = [],
): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) return;
  try {
    await sendEmail({
      to,
      subject,
      email: renderBrandedEmail({
        heading: subject,
        paragraphs,
        facts: [
          { label: "Business (deleted)", value: row.business_name ?? row.business_id },
          { label: "Clerk org", value: row.clerk_org_id },
          { label: "Razorpay subscription", value: row.razorpay_subscription_id },
          { label: "Razorpay customer", value: row.razorpay_customer_id ?? "unknown" },
          { label: "Deleted by", value: describeReason(row.reason) },
          { label: "Deleted at (UTC)", value: row.created_at },
          ...extraFacts,
          ...(detail ? [{ label: "Detail", value: detail }] : []),
        ],
      }),
    });
  } catch {
    logEvent("ops_alert_email_failed", row.business_id, { cancellationId: row.id }, "error");
  }
}

function describeReason(reason: CancellationReason): string {
  switch (reason) {
    case "admin_soft_deleted":
      return "platform admin (soft-delete in /apache)";
    case "admin_hard_deleted":
      return "platform admin (permanent delete in /apache)";
    default:
      return "the business owner";
  }
}
