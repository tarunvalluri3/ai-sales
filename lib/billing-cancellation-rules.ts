/**
 * Pure rules for cancelling a deleted business's Razorpay subscription
 * (production readiness, item 6). No server-only import.
 *
 * Decision (owner, 2026-11-03): cancel IMMEDIATELY on delete
 * (cancel_at_cycle_end = 0). The customer chose to delete all their data,
 * so there is nothing left to give them access to until period end.
 * Free-trial and card rules are NOT changed here (a separate product
 * decision, see LAUNCH_AUDIT.md).
 */

/** Razorpay subscription statuses after which it can never charge again. */
export const TERMINAL_RAZORPAY_STATUSES: readonly string[] = ["cancelled", "completed", "expired"];

export function isTerminalRazorpayStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && TERMINAL_RAZORPAY_STATUSES.includes(status);
}

/**
 * Whether deleting this business needs a Razorpay cancellation. Any stored
 * subscription id counts -- even one our row calls "cancelled" (that can mean
 * cancel-at-period-end, with the mandate still live until then). Annual plans
 * are one-time orders with no mandate, and trials without checkout have no
 * subscription id: nothing to cancel.
 */
export function needsCancellationOnDelete(subscription: { razorpay_subscription_id: string | null; status: string } | null): boolean {
  if (!subscription?.razorpay_subscription_id) return false;
  return subscription.status !== "expired";
}

/**
 * Retries back off 1, 2, 4 ... minutes (each capped at 6 h); after 10
 * attempts -- about 8.5 hours of retrying -- the row is `failed` and a human
 * must cancel by hand (alerted). The first failure already alerts, and a
 * later charge for the subscription re-opens the row (handleDeletedBusinessEvent).
 */
export const MAX_CANCELLATION_ATTEMPTS = 10;
const BASE_SECONDS = 60;
const CAP_SECONDS = 6 * 60 * 60;

export function cancellationBackoffSeconds(attempts: number): number {
  return Math.min(BASE_SECONDS * 2 ** Math.max(0, attempts - 1), CAP_SECONDS);
}

export type CancellationAttemptOutcome =
  | { status: "cancelled" }
  | { status: "pending"; nextAttemptInSeconds: number; alert: boolean }
  | { status: "failed"; alert: true };

/**
 * What to record after an attempt. `confirmedTerminal` = Razorpay's own
 * status (from the cancel response, or a fetch after a failed cancel) is
 * terminal. Alerts on the FIRST failure (so a human knows immediately) and
 * when retries run out.
 */
export function nextCancellationState(attemptsSoFar: number, confirmedTerminal: boolean): CancellationAttemptOutcome {
  if (confirmedTerminal) return { status: "cancelled" };
  const attempts = attemptsSoFar + 1;
  if (attempts >= MAX_CANCELLATION_ATTEMPTS) return { status: "failed", alert: true };
  return { status: "pending", nextAttemptInSeconds: cancellationBackoffSeconds(attempts), alert: attempts === 1 };
}

export type DeletedBusinessEventAction =
  /** Money moved for a deleted business: alert, retry the cancellation now. */
  | "charge_after_deletion"
  /** Razorpay confirms the mandate is over. */
  | "confirm_cancelled"
  /** Anything else (pending, halted, activated ...): acknowledged, logged. */
  | "acknowledge";

export function classifyDeletedBusinessEvent(event: string): DeletedBusinessEventAction {
  if (event === "subscription.charged") return "charge_after_deletion";
  if (event === "subscription.cancelled" || event === "subscription.completed") return "confirm_cancelled";
  return "acknowledge";
}
