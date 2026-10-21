import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { PLANS, type PlanKey } from "@/lib/plans";
import { cancelSubscription, updateSubscriptionPlanAtCycleEnd } from "@/lib/razorpay";
import { readBillingSubscription, sendBillingNotice, updateBillingSubscription } from "@/lib/billing-store";
import { isUpgrade, proRataUpgradeQuote, type ProRataQuote } from "@/lib/billing-prorata";
import {
  startMonthlyCheckout,
  startProRataUpgradeCheckout,
  type BillingIdentity,
  type CheckoutSession,
} from "@/lib/billing-checkout";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Plan changes and cancellation. Phase 17b (STATE.md).
 *
 * **THE SEMANTICS, CHOSEN AND STATED.** Upgrade immediately, downgrade at
 * period end.
 *
 * - **Upgrade takes effect at once, and the customer pays the pro-rated
 *   difference for the rest of the period.** Not a design preference: it
 *   is what /pricing already promises in those words ("you can upgrade at
 *   any time and we charge only the difference for the rest of your
 *   period"), and what the at-quota upgrade email promises too. A customer
 *   upgrading is almost always upgrading *because* they have hit a limit,
 *   so an upgrade that waited for the period boundary would be useless at
 *   the exact moment it was bought.
 * - **Downgrade takes effect at the period end.** The customer has paid
 *   for this period at the higher price; taking the entitlement away
 *   before the period they paid for has ended would be charging for
 *   something and then not supplying it. There is no refund (/refunds), so
 *   the only fair treatment is to keep delivering what was bought.
 * - **A downgrade therefore cannot leave a business over its new quota
 *   mid-period**, which is the specific failure worth designing out. The
 *   quota and channels stay on the *current* plan until the boundary, the
 *   new plan is applied by `subscription.charged` at the moment the fresh
 *   period starts, and the reply count for that fresh period begins at
 *   zero (lib/usage-limit.ts counts from `current_period_start`). There is
 *   no instant in which the quota is lower than the replies already used.
 *
 * **THE UPI CONSTRAINT, which shapes all of this.** Razorpay only allows a
 * live subscription to be updated when its mandate was authorised **by
 * card** -- UPI AutoPay and eMandate mandates cannot be updated. UPI
 * AutoPay is a confirmed requirement for this product, so that refusal is
 * an expected outcome, not an edge case. When it happens, the recurring
 * mandate is cancelled at period end instead and the customer is asked to
 * authorise the new plan before then. The dashboard shows the same thing
 * it shows for any cancellation -- "nothing will renew, re-subscribe
 * before <date>" -- because that is the identical instruction, and giving
 * it a second distinct state would be two ways of saying one thing.
 */

export type PlanChangeResult =
  /** The customer must complete a Checkout: a pro-rata payment, or a new mandate. */
  | { outcome: "checkout_required"; session: CheckoutSession; quote?: ProRataQuote }
  /** Applied with no payment: a downgrade scheduled for the period boundary. */
  | { outcome: "scheduled"; effectiveAt: string; toPlanKey: PlanKey }
  /** Applied immediately with no payment (an upgrade with nothing left to pro-rate). */
  | { outcome: "applied"; toPlanKey: PlanKey }
  /** The mandate could not be moved, so it will not renew. Re-subscribe before the date. */
  | { outcome: "reauthorisation_required"; renewBefore: string; toPlanKey: PlanKey };

/**
 * Quotes a plan change without starting one, for the confirmation copy on
 * /dashboard/billing. Pure arithmetic over the registry plus one read.
 */
export async function quotePlanChange(params: {
  businessId: string;
  toPlanKey: PlanKey;
  now?: Date;
}): Promise<{ direction: "upgrade" | "downgrade"; quote: ProRataQuote | null; effectiveAt: string | null }> {
  const now = params.now ?? new Date();
  const supabase = createServiceSupabaseClient();
  const row = await readBillingSubscription(supabase, params.businessId);
  if (!row) return { direction: "upgrade", quote: null, effectiveAt: null };

  const interval = row.billing_interval ?? "monthly";
  const direction = isUpgrade(row.plan_key, params.toPlanKey, interval) ? "upgrade" : "downgrade";

  if (direction === "downgrade") {
    return { direction, quote: null, effectiveAt: row.current_period_end };
  }

  if (row.status === "trialing" || !row.current_period_start || !row.current_period_end) {
    // Nothing has been paid for this period, so there is nothing to
    // pro-rate against.
    return { direction, quote: null, effectiveAt: null };
  }

  return {
    direction,
    quote: proRataUpgradeQuote({
      fromPlanKey: row.plan_key,
      toPlanKey: params.toPlanKey,
      interval,
      periodStartIso: row.current_period_start,
      periodEndIso: row.current_period_end,
      now,
    }),
    effectiveAt: null,
  };
}

export async function changePlan(params: {
  businessId: string;
  userId: string;
  toPlanKey: PlanKey;
  /** Needed only when the change requires a new mandate (a trial, or a re-authorisation). */
  identity: BillingIdentity;
  now?: Date;
}): Promise<PlanChangeResult> {
  const now = params.now ?? new Date();
  const supabase = createServiceSupabaseClient();
  const row = await readBillingSubscription(supabase, params.businessId);

  if (!row) {
    // No row and no grandfathered materialisation yet: this is a first
    // subscription, not a change.
    return {
      outcome: "checkout_required",
      session: await startMonthlyCheckout({
        businessId: params.businessId,
        userId: params.userId,
        planKey: params.toPlanKey,
        identity: params.identity,
        now,
      }),
    };
  }

  if (row.plan_key === params.toPlanKey && row.scheduled_plan_key === null) {
    throw new AppError(
      `You are already on the ${PLANS[params.toPlanKey].name} plan.`,
      "changePlan to the current plan",
    );
  }

  const interval = row.billing_interval ?? "monthly";

  /**
   * A trial has not paid for anything, so a plan change is simply a new
   * mandate at the new amount. `startMonthlyCheckout` cancels the
   * unauthorised one first, so a customer who changes their mind three
   * times leaves one live subscription object, not three.
   *
   * There is no pro-rata and no scheduling: nothing has been bought, so
   * neither concept applies.
   */
  if (row.status === "trialing") {
    return {
      outcome: "checkout_required",
      session: await startMonthlyCheckout({
        businessId: params.businessId,
        userId: params.userId,
        planKey: params.toPlanKey,
        identity: params.identity,
        now,
      }),
    };
  }

  if (isUpgrade(row.plan_key, params.toPlanKey, interval)) {
    return upgradeNow(supabase, { ...params, now }, row.plan_key, row, interval);
  }

  return scheduleDowngrade(supabase, { ...params, now }, row.plan_key, row, interval);
}

type Row = NonNullable<Awaited<ReturnType<typeof readBillingSubscription>>>;

async function upgradeNow(
  supabase: ServiceClient,
  params: { businessId: string; userId: string; toPlanKey: PlanKey; now: Date },
  fromPlanKey: PlanKey,
  row: Row,
  interval: "monthly" | "annual",
): Promise<PlanChangeResult> {
  const quote =
    row.current_period_start && row.current_period_end
      ? proRataUpgradeQuote({
          fromPlanKey,
          toPlanKey: params.toPlanKey,
          interval,
          periodStartIso: row.current_period_start,
          periodEndIso: row.current_period_end,
          now: params.now,
        })
      : null;

  // The period is effectively over (or absent), so there is nothing left
  // to charge for. Zero is a real answer, not an error: "upgrade on the
  // last hour of the period" is a thing customers do, and billing them a
  // rounding artefact for it would be worse than billing nothing.
  if (!quote || quote.amountPaise === 0) {
    await applyPlanImmediately(supabase, params, fromPlanKey, interval);
    return { outcome: "applied", toPlanKey: params.toPlanKey };
  }

  // Payment first, entitlement second. The pro-rata order's `order.paid`
  // webhook (or its Checkout callback -- both apply the same patch) is what
  // moves `plan_key`, so a customer who abandons the payment sheet does not
  // get the upgrade.
  const session = await startProRataUpgradeCheckout({
    businessId: params.businessId,
    userId: params.userId,
    toPlanKey: params.toPlanKey,
    quote,
  });

  return { outcome: "checkout_required", session, quote };
}

/**
 * Moves the recurring mandate onto the new plan at the cycle boundary, so
 * the *next* charge is the new price, and reports whether Razorpay allowed
 * it. The pro-rata for the remainder of the current period is handled
 * separately and explicitly, by an order.
 */
async function applyPlanImmediately(
  supabase: ServiceClient,
  params: { businessId: string; userId: string; toPlanKey: PlanKey },
  fromPlanKey: PlanKey,
  interval: "monthly" | "annual",
): Promise<void> {
  await updateBillingSubscription(supabase, params.businessId, {
    plan_key: params.toPlanKey,
    scheduled_plan_key: null,
  });
  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.plan_changed",
    "subscription",
    params.businessId,
    { planKey: params.toPlanKey, previousPlanKey: fromPlanKey, trigger: "upgrade_no_prorata_due", interval },
  );
  logEvent("billing_plan_upgraded_immediately", params.businessId, {
    planKey: params.toPlanKey,
    previousPlanKey: fromPlanKey,
  });
}

async function scheduleDowngrade(
  supabase: ServiceClient,
  params: { businessId: string; userId: string; toPlanKey: PlanKey; now: Date },
  fromPlanKey: PlanKey,
  row: Row,
  interval: "monthly" | "annual",
): Promise<PlanChangeResult> {
  const effectiveAt = row.current_period_end ?? params.now.toISOString();

  /**
   * An annual term does not renew itself -- it is a one-time order -- so
   * there is no scheduled charge to reprice and nothing to store. The
   * customer simply buys the smaller plan when they renew, and the
   * reminder emails already tell them when that is. Storing a
   * `scheduled_plan_key` here would be a promise nothing would ever keep.
   */
  if (interval === "annual") {
    await recordAuditLogEntry(
      params.businessId,
      params.userId,
      "subscription.plan_change_scheduled",
      "subscription",
      params.businessId,
      { planKey: params.toPlanKey, previousPlanKey: fromPlanKey, interval: "annual", effectiveAt },
    );
    logEvent("billing_annual_downgrade_noted", params.businessId, {
      planKey: params.toPlanKey,
      previousPlanKey: fromPlanKey,
    });
    return { outcome: "scheduled", effectiveAt, toPlanKey: params.toPlanKey };
  }

  await updateBillingSubscription(supabase, params.businessId, {
    scheduled_plan_key: params.toPlanKey,
  });

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.plan_change_scheduled",
    "subscription",
    params.businessId,
    { planKey: params.toPlanKey, previousPlanKey: fromPlanKey, interval: "monthly", effectiveAt },
  );

  const moved = row.razorpay_subscription_id
    ? await updateSubscriptionPlanAtCycleEnd({
        subscriptionId: row.razorpay_subscription_id,
        planKey: params.toPlanKey,
        businessId: params.businessId,
      })
    : { outcome: "refused" as const, reason: "no_subscription" };

  if (moved.outcome === "updated") {
    logEvent("billing_downgrade_scheduled", params.businessId, {
      planKey: params.toPlanKey,
      previousPlanKey: fromPlanKey,
      effectiveAt,
    });
    return { outcome: "scheduled", effectiveAt, toPlanKey: params.toPlanKey };
  }

  // The documented refusal: a mandate authorised by UPI AutoPay or
  // eMandate cannot be updated. Cancel it at the cycle boundary instead
  // and ask for a new mandate on the new plan -- the customer keeps
  // everything they paid for, and nothing charges at the old price.
  return reauthorisationRequired(supabase, params, fromPlanKey, row, effectiveAt, moved.reason);
}

/**
 * The fallback when Razorpay will not reprice a live mandate.
 *
 * The mandate is cancelled **at the cycle end**, so the customer keeps the
 * period they paid for, and `scheduled_plan_key` is left set so the
 * dashboard can show which plan they were trying to move to. They
 * re-authorise through the ordinary checkout, which is the same flow as a
 * first subscription -- deliberately, so this needs no separate UI and no
 * separate code path that could rot untested.
 */
async function reauthorisationRequired(
  supabase: ServiceClient,
  params: { businessId: string; userId: string; toPlanKey: PlanKey },
  fromPlanKey: PlanKey,
  row: Row,
  effectiveAt: string,
  reason: string,
): Promise<PlanChangeResult> {
  if (row.razorpay_subscription_id) {
    await cancelSubscription(row.razorpay_subscription_id, true, params.businessId).catch(() => {
      logEvent("billing_reauth_cancel_failed", params.businessId, {}, "error");
    });
  }

  await updateBillingSubscription(supabase, params.businessId, {
    cancel_at_period_end: true,
    scheduled_plan_key: params.toPlanKey,
  });

  logEvent(
    "billing_plan_change_needs_reauthorisation",
    params.businessId,
    { planKey: params.toPlanKey, previousPlanKey: fromPlanKey, reason, renewBefore: effectiveAt },
    "error",
  );

  return { outcome: "reauthorisation_required", renewBefore: effectiveAt, toPlanKey: params.toPlanKey };
}

/* ------------------------------------------------------------------ *
 * Cancellation
 * ------------------------------------------------------------------ */

export type CancellationResult = { accessUntil: string };

/**
 * Cancels at period end, keeping access until then.
 *
 * The confirmed decision, and the only one consistent with /refunds: fees
 * already paid are not refundable, so access to the period that was paid
 * for cannot be withdrawn. Cancelling immediately *and* not refunding
 * would be the one genuinely unfair combination.
 *
 * Razorpay is told to cancel at the cycle end, and the resulting
 * `subscription.cancelled` webhook is what finally moves the stored
 * status -- webhooks remain the source of truth. `cancel_at_period_end` is
 * set here as well, immediately, so the dashboard tells the truth the
 * moment the customer clicks rather than after a round trip through
 * Razorpay.
 *
 * A **trialing** row keeps `status = 'trialing'` and simply loses its
 * mandate: `subscriptions_period_dates_present` refuses a non-trialing
 * status with no billing period, and the honest description of a cancelled
 * trial is that the trial is still running and will not convert. The daily
 * sweep expires it on its own end date.
 *
 * An **annual** term has no mandate to cancel -- it never renews by itself
 * -- so cancelling is a statement of intent that stops the renewal
 * reminders from being the wrong message.
 */
export async function cancelAtPeriodEnd(params: {
  businessId: string;
  userId: string;
  now?: Date;
}): Promise<CancellationResult> {
  const now = params.now ?? new Date();
  const supabase = createServiceSupabaseClient();
  const row = await readBillingSubscription(supabase, params.businessId);

  if (!row) {
    throw new AppError("There is no active plan to cancel.", "cancelAtPeriodEnd with no subscription row");
  }

  if (row.status === "expired") {
    throw new AppError("That plan has already ended.", "cancelAtPeriodEnd on an expired subscription");
  }

  if (row.razorpay_subscription_id) {
    await cancelSubscription(row.razorpay_subscription_id, row.status !== "trialing", params.businessId);
  }

  await updateBillingSubscription(supabase, params.businessId, {
    cancel_at_period_end: true,
    // A scheduled downgrade will never arrive now.
    scheduled_plan_key: null,
    // A trialing row loses its mandate and keeps its trial; a paid row
    // keeps its subscription id so the cancellation webhook can still find
    // it by the primary correlation path.
    ...(row.status === "trialing" ? { razorpay_subscription_id: null } : {}),
  });

  const accessUntil = row.current_period_end ?? row.trial_ends_at ?? now.toISOString();

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.cancellation_scheduled",
    "subscription",
    params.businessId,
    { planKey: row.plan_key, status: row.status, accessUntil },
  );

  // The webhook sends this too, for a Razorpay-side cancellation. Both go
  // through the same at-most-once claim, so the customer gets one email.
  await sendBillingNotice(supabase, "subscription_cancelled", row, {
    periodEndIso: accessUntil,
    planKey: row.plan_key,
  });

  logEvent("billing_cancellation_scheduled", params.businessId, {
    planKey: row.plan_key,
    status: row.status,
    accessUntil,
  });

  return { accessUntil };
}
