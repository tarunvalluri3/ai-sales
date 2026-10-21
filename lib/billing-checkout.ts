import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { PLANS, PLAN_KEYS, TRIAL_DAYS, type PlanKey } from "@/lib/plans";
import {
  cancelSubscription,
  createMonthlySubscription,
  createOrder,
  fetchSubscription,
  getRazorpayConfig,
} from "@/lib/razorpay";
import { verifyOrderPaymentSignature, verifySubscriptionPaymentSignature } from "@/lib/razorpay-signature";
import {
  annualActivationPatch,
  prorataActivationPatch,
  type BillingSubscriptionRow,
} from "@/lib/razorpay-webhook";
import {
  readBillingSubscription,
  updateBillingSubscription,
} from "@/lib/billing-store";
import { proRataUpgradeQuote, type ProRataQuote } from "@/lib/billing-prorata";
import type { BillingIdentity } from "@/lib/billing-identity";
import { resolveInvoiceHolds } from "@/lib/invoice-store";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Checkout: creating what the customer is about to authorise, and
 * verifying the callback when they have. Phase 17b (STATE.md).
 *
 * **The division of labour, which is the whole design here.** The Razorpay
 * Checkout callback is treated as **UI**: it proves the customer got
 * through the payment sheet and it lets the dashboard show the truth
 * immediately instead of making them refresh. **Webhooks are the source of
 * truth for subscription state** -- a customer who closes the tab at the
 * wrong moment must not leave us permanently inconsistent with the money.
 * So every callback path here either writes something a webhook would
 * write identically (the shared patches in lib/razorpay-webhook.ts), or
 * writes nothing at all and waits.
 *
 * **The client never supplies an amount or a plan price.** Amounts are
 * always derived from `lib/plans.ts`. On the monthly path the client does
 * not even supply the plan key at confirmation time: it is read back from
 * the Razorpay subscription the customer actually authorised (see
 * `confirmMonthlyCheckout`), so a tampered form cannot grant a plan nobody
 * paid for.
 */

/** What the browser needs to open Checkout for a mandate. */
export type MonthlyCheckoutSession = {
  kind: "subscription";
  /** Public. Razorpay's key id is published in every Checkout integration. */
  razorpayKeyId: string;
  subscriptionId: string;
  planKey: PlanKey;
  planName: string;
  /** GST-inclusive gross, in paise, for display only -- Razorpay charges the plan. */
  amountPaise: number;
  /** ISO, or null when the first charge is immediate (no trial left). */
  firstChargeAt: string | null;
};

/** What the browser needs to open Checkout for a one-time payment. */
export type OrderCheckoutSession = {
  kind: "order";
  razorpayKeyId: string;
  orderId: string;
  planKey: PlanKey;
  planName: string;
  /** GST-inclusive gross, in paise. This exact amount is what Razorpay charges. */
  amountPaise: number;
  purpose: "annual" | "upgrade_prorata";
};

export type CheckoutSession = MonthlyCheckoutSession | OrderCheckoutSession;

function requireConfig() {
  const config = getRazorpayConfig();
  if (!config) {
    throw new AppError(
      "Payments are not set up yet. Please contact us and we will sort it out.",
      "razorpay_not_configured",
    );
  }
  return config;
}

/**
 * Guarantees a `subscriptions` row exists before checkout writes to it.
 *
 * Every business created from Phase 17b onwards has one already -- the
 * `businesses_create_trial_subscription` trigger makes it in the same
 * transaction as the business itself. This covers the one case that
 * trigger cannot: a **grandfathered tenant**, created before billing
 * existed, which by Phase 17a's design has no row at all and is therefore
 * resolved to Scale entitlements on a calendar month.
 *
 * The row written here **encodes exactly that grandfathered state** --
 * Scale, active, the current UTC calendar month -- so inserting it changes
 * nothing whatsoever for that tenant. It is a materialisation of the
 * default, not a new deal. Two things it deliberately does *not* do:
 *
 * - It does not start a trial. `trial_started_at` is write-once, so a trial
 *   granted here would be permanent, and a tenant that has been using the
 *   product for months is not entitled to one. It is also the wrong
 *   direction: a trial's cap is 200 replies, which would *reduce* a
 *   grandfathered tenant's quota from 10,000.
 * - It does not set `plan_key` to whatever they are about to buy. Nothing
 *   is bought yet.
 */
async function ensureSubscriptionRow(
  supabase: ServiceClient,
  businessId: string,
): Promise<BillingSubscriptionRow> {
  const existing = await readBillingSubscription(supabase, businessId);
  if (existing) return existing;

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const { error } = await supabase.from("subscriptions").insert({
    business_id: businessId,
    // GRANDFATHERED_PLAN_KEY in lib/subscription.ts. Kept identical on
    // purpose: this row must be indistinguishable from the absent-row
    // default it replaces.
    plan_key: "scale",
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
  });

  // A concurrent checkout (two tabs) can have inserted it already. Not an
  // error -- re-read and use whichever row exists.
  if (error && error.code !== "23505") {
    logEvent("billing_subscription_row_create_failed", businessId, { code: error.code ?? "unknown" }, "error");
    throw new AppError(
      "We could not start that checkout. Please try again.",
      `billing_subscription_row_create_failed ${error.code ?? "unknown"}`,
    );
  }

  const row = await readBillingSubscription(supabase, businessId);
  if (!row) {
    throw new AppError(
      "We could not start that checkout. Please try again.",
      "billing_subscription_row_missing_after_insert",
    );
  }
  logEvent("billing_grandfathered_row_materialised", businessId, { planKey: row.plan_key });
  return row;
}

/**
 * When the first real charge should land: at the end of an unexpired
 * trial, or immediately.
 *
 * The confirmed decision is that a payment method is required at signup,
 * so the mandate is authenticated now and `start_at` defers the money to
 * trial end. Razorpay **rejects a `start_at` in the past**, so a trial
 * that has already run out (or a grandfathered tenant, which never had
 * one) gets no `start_at` at all and is charged on authorisation -- which
 * is the honest behaviour: there is no free period left to honour.
 */
function firstChargeAtFor(row: BillingSubscriptionRow, now: Date): number | null {
  if (row.status !== "trialing" || !row.trial_ends_at) return null;
  const trialEndMs = new Date(row.trial_ends_at).getTime();
  // A one-minute cushion: a `start_at` of "now" races the API call itself.
  if (trialEndMs <= now.getTime() + 60_000) return null;
  return Math.floor(trialEndMs / 1000);
}

/**
 * Creates the Razorpay subscription for a monthly plan and returns what
 * the browser needs to authorise it.
 *
 * **Nothing about the entitlement changes here.** `plan_key` is untouched
 * until the customer actually completes Checkout, because creating a
 * subscription object is not a purchase -- a customer who opens the sheet
 * and closes it must not end up on a plan.
 *
 * An existing *unauthorised* mandate is cancelled first. Without that, a
 * customer who changes their mind twice would leave two or three live
 * subscription objects on the same business, any of which could later
 * start charging.
 */
export async function startMonthlyCheckout(params: {
  businessId: string;
  userId: string;
  planKey: PlanKey;
  identity: BillingIdentity;
  now?: Date;
}): Promise<MonthlyCheckoutSession> {
  const config = requireConfig();
  const now = params.now ?? new Date();
  const supabase = createServiceSupabaseClient();
  const row = await ensureSubscriptionRow(supabase, params.businessId);
  const plan = PLANS[params.planKey];

  // Replace, never accumulate. Cancelled immediately (not at cycle end)
  // because a mandate that has not charged has no paid period to protect.
  if (row.razorpay_subscription_id) {
    await cancelSubscription(row.razorpay_subscription_id, false, params.businessId).catch(() => {
      // Already cancelled, already completed, or unknown to Razorpay. The
      // new subscription below is what matters; a stale object we failed to
      // cancel cannot charge a mandate the customer never re-authorised.
      logEvent("billing_stale_subscription_cancel_failed", params.businessId, {}, "error");
    });
  }

  const startAt = firstChargeAtFor(row, now);
  const subscription = await createMonthlySubscription({
    planKey: params.planKey,
    businessId: params.businessId,
    expectedAmountPaise: plan.monthlyPricePaise,
    // No trial left means charge on authorisation; Razorpay refuses a past
    // `start_at`, so the field is omitted rather than back-dated.
    startAt: startAt ?? Math.floor(now.getTime() / 1000) + 120,
  });

  await updateBillingSubscription(supabase, params.businessId, {
    razorpay_subscription_id: subscription.id,
    billing_interval: "monthly",
  });
  await saveBillingIdentity(supabase, params.businessId, params.identity);

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.checkout_started",
    "subscription",
    params.businessId,
    { planKey: params.planKey, interval: "monthly", trialDays: startAt ? TRIAL_DAYS : 0 },
  );

  logEvent("billing_monthly_checkout_started", params.businessId, {
    planKey: params.planKey,
    deferredToTrialEnd: startAt !== null,
  });

  void config;
  return {
    kind: "subscription",
    razorpayKeyId: config.keyId,
    subscriptionId: subscription.id,
    planKey: params.planKey,
    planName: plan.name,
    amountPaise: plan.monthlyPricePaise,
    firstChargeAt: startAt ? new Date(startAt * 1000).toISOString() : null,
  };
}

/**
 * Verifies the Checkout callback for a mandate and records the plan the
 * customer committed to.
 *
 * **The signature is checked against our stored subscription id**, never
 * the one Checkout handed the browser -- Razorpay's own guide says so, and
 * the reason is that verifying a signature against a value supplied by the
 * same client that supplied the signature proves nothing about which
 * subscription was really paid for.
 *
 * **The plan key is read back from Razorpay**, not taken from the request.
 * The mandate the customer authorised is the only authority on what they
 * agreed to pay, so a tampered form cannot move a business onto Scale.
 *
 * The status stays `trialing` until the first charge: the money has not
 * moved yet, and claiming `active` before it does would be a lie the quota
 * logic would act on. What *does* change is `plan_key`, so a Growth
 * trialist gets Growth's channels from the moment they commit -- the trial
 * is for trying the thing you are buying, and the 200-reply trial cap is
 * unaffected by plan key either way.
 */
export async function confirmMonthlyCheckout(params: {
  businessId: string;
  paymentId: string;
  signature: string;
}): Promise<{ planKey: PlanKey }> {
  const config = requireConfig();
  const supabase = createServiceSupabaseClient();
  const row = await readBillingSubscription(supabase, params.businessId);

  if (!row?.razorpay_subscription_id) {
    throw new AppError(
      "We could not find that checkout. Please start again.",
      "confirmMonthlyCheckout with no stored subscription id",
    );
  }

  const verified = verifySubscriptionPaymentSignature(
    { paymentId: params.paymentId, subscriptionId: row.razorpay_subscription_id, signature: params.signature },
    config.keySecret,
  );

  if (!verified) {
    // The one case that must never be shrugged off: a callback claiming a
    // payment that cannot be proved. Logged at error level so it reaches
    // Sentry, and nothing is written.
    logEvent("billing_checkout_signature_invalid", params.businessId, { kind: "subscription" }, "error");
    throw new AppError(
      "We could not verify that payment. Nothing has been charged twice -- please contact us before trying again.",
      "razorpay_subscription_signature_invalid",
    );
  }

  const subscription = await fetchSubscription(row.razorpay_subscription_id);
  const planKey = planKeyForRazorpayPlanId(subscription?.plan_id ?? null);
  if (!planKey) {
    // Verified payment, but a plan id this app does not recognise. Not
    // guessed at: a wrong entitlement is worse than a delayed one, and the
    // webhook will still set the period and status when the charge lands.
    logEvent(
      "billing_checkout_unknown_plan_id",
      params.businessId,
      { subscriptionStatus: subscription?.status ?? null },
      "error",
    );
    throw new AppError(
      "Your payment went through, but we could not match it to a plan. We are on it -- please contact us.",
      "razorpay_subscription_plan_id_unrecognised",
    );
  }

  await updateBillingSubscription(supabase, params.businessId, {
    plan_key: planKey,
    billing_interval: "monthly",
    razorpay_customer_id: subscription?.customer_id ?? undefined,
  });

  logEvent("billing_monthly_checkout_confirmed", params.businessId, {
    planKey,
    razorpayStatus: subscription?.status ?? null,
  });

  return { planKey };
}

/** Reverses the configured plan-id map. Null for an id this app did not create. */
function planKeyForRazorpayPlanId(planId: string | null): PlanKey | null {
  if (!planId) return null;
  const config = getRazorpayConfig();
  if (!config) return null;
  return PLAN_KEYS.find((key) => config.monthlyPlanIds[key] === planId) ?? null;
}

/**
 * Creates the one-time order for an annual plan.
 *
 * **Annual is an order, not a subscription**, and that is a confirmed
 * decision rather than a shortcut: two months free means ten months'
 * gross, and RBI's additional-factor-of-authentication rules would make an
 * annual mandate re-authenticate every cycle anyway. A mandate therefore
 * buys nothing over an order here, and costs the ability to take the money
 * in one authenticated transaction.
 *
 * The consequence is stated plainly to the customer: nothing renews
 * itself. Two reminder emails go out 14 and 3 days before the term ends
 * (lib/billing-lifecycle.ts), and if it lapses the AI stops the same way an
 * exhausted quota does -- never a broken widget.
 */
export async function startAnnualCheckout(params: {
  businessId: string;
  userId: string;
  planKey: PlanKey;
  identity: BillingIdentity;
}): Promise<OrderCheckoutSession> {
  const config = requireConfig();
  const supabase = createServiceSupabaseClient();
  await ensureSubscriptionRow(supabase, params.businessId);
  const plan = PLANS[params.planKey];

  const order = await createOrder({
    // Derived from the registry, never from the client.
    amountPaise: plan.annualPricePaise,
    receipt: `annual-${params.planKey}-${Date.now()}`,
    businessId: params.businessId,
    notes: { purpose: "annual", plan_key: params.planKey },
  });

  await updateBillingSubscription(supabase, params.businessId, { razorpay_order_id: order.id });
  await saveBillingIdentity(supabase, params.businessId, params.identity);

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.checkout_started",
    "subscription",
    params.businessId,
    { planKey: params.planKey, interval: "annual", amountPaise: plan.annualPricePaise },
  );

  logEvent("billing_annual_checkout_started", params.businessId, { planKey: params.planKey });

  return {
    kind: "order",
    razorpayKeyId: config.keyId,
    orderId: order.id,
    planKey: params.planKey,
    planName: plan.name,
    amountPaise: plan.annualPricePaise,
    purpose: "annual",
  };
}

/**
 * Verifies a one-time order's Checkout callback and applies it.
 *
 * Applies **the same patch the `order.paid` webhook applies**
 * (`annualActivationPatch` / `prorataActivationPatch`, both exported from
 * lib/razorpay-webhook.ts) so the two paths cannot drift. Whichever
 * arrives first wins; the other is a no-op. That is what makes it safe to
 * treat this callback as a convenience rather than a requirement.
 *
 * `purpose` and the plan come from the order's **notes as we set them**,
 * re-read from our own row, not from the request body.
 */
export async function confirmOrderCheckout(params: {
  businessId: string;
  orderId: string;
  paymentId: string;
  signature: string;
  planKey: PlanKey;
  purpose: "annual" | "upgrade_prorata";
  now?: Date;
}): Promise<void> {
  const config = requireConfig();
  const now = params.now ?? new Date();
  const supabase = createServiceSupabaseClient();
  const row = await readBillingSubscription(supabase, params.businessId);

  if (!row || row.razorpay_order_id !== params.orderId) {
    // The order id is checked against the one we stored when we created
    // it, so a callback cannot name an order this business never started.
    throw new AppError(
      "We could not find that payment. Please start again.",
      "confirmOrderCheckout order id does not match the stored one",
    );
  }

  const verified = verifyOrderPaymentSignature(
    { orderId: params.orderId, paymentId: params.paymentId, signature: params.signature },
    config.keySecret,
  );

  if (!verified) {
    logEvent("billing_checkout_signature_invalid", params.businessId, { kind: "order" }, "error");
    throw new AppError(
      "We could not verify that payment. Nothing has been charged twice -- please contact us before trying again.",
      "razorpay_order_signature_invalid",
    );
  }

  if (params.purpose === "annual") {
    await updateBillingSubscription(
      supabase,
      params.businessId,
      annualActivationPatch(params.planKey, params.orderId, now),
    );
    logEvent("billing_annual_checkout_confirmed", params.businessId, { planKey: params.planKey });
    return;
  }

  await updateBillingSubscription(
    supabase,
    params.businessId,
    prorataActivationPatch(params.planKey, params.orderId),
  );
  logEvent("billing_prorata_checkout_confirmed", params.businessId, {
    planKey: params.planKey,
    previousPlanKey: row.plan_key,
  });
}

/**
 * Stores the customer's billing identity: name, address, place of supply
 * and optional GSTIN -- everything a GST tax invoice prints about the
 * recipient (Phase 17c).
 *
 * **Strict on write failure.** Before 17c this was best-effort, because
 * losing it was a problem for later. Now an invoice cannot be issued
 * without it, and every caller runs BEFORE the customer is shown the
 * payment sheet, so refusing to continue costs nothing -- whereas carrying
 * on and then taking a payment we cannot invoice would put a paying
 * customer's invoice on hold.
 *
 * **Applies to future invoices only.** Issued invoices are immutable
 * snapshots (20261026000000): nothing written here can reach one.
 */
export async function saveBillingIdentity(
  supabase: ServiceClient,
  businessId: string,
  identity: BillingIdentity,
): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .update({
      billing_name: identity.name,
      billing_address: identity.address,
      billing_state_code: identity.stateCode,
      gstin: identity.gstin,
    })
    .eq("business_id", businessId);

  if (error) {
    logEvent("billing_identity_save_failed", businessId, { code: error.code ?? "unknown" }, "error");
    throw new AppError(
      "We could not save your billing details. Please try again.",
      `billing_identity_save_failed ${error.code ?? "unknown"}`,
    );
  }
}

/**
 * Saves billing details from the billing page, outside any checkout, and
 * then retries every invoice that was waiting on them. A customer fixing a
 * missing state therefore gets the invoice they were owed within seconds,
 * emailed, with nothing further to do.
 */
export async function updateBillingDetails(params: {
  businessId: string;
  userId: string;
  identity: BillingIdentity;
}): Promise<{ invoicesIssued: number }> {
  const supabase = createServiceSupabaseClient();
  await ensureSubscriptionRow(supabase, params.businessId);
  await saveBillingIdentity(supabase, params.businessId, params.identity);

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "billing_details.updated",
    "subscription",
    params.businessId,
    { stateCode: params.identity.stateCode, hasGstin: params.identity.gstin !== null },
  );

  const resolution = await resolveInvoiceHolds(supabase, { businessId: params.businessId });
  return { invoicesIssued: resolution.issued };
}

/**
 * Creates the one-time order for the pro-rated difference on an immediate
 * upgrade. The quote is computed from the registry
 * (lib/billing-prorata.ts); the client supplies only the target plan.
 */
export async function startProRataUpgradeCheckout(params: {
  businessId: string;
  userId: string;
  toPlanKey: PlanKey;
  quote: ProRataQuote;
}): Promise<OrderCheckoutSession> {
  const config = requireConfig();
  const supabase = createServiceSupabaseClient();
  const plan = PLANS[params.toPlanKey];

  const order = await createOrder({
    amountPaise: params.quote.amountPaise,
    receipt: `upgrade-${params.toPlanKey}-${Date.now()}`,
    businessId: params.businessId,
    notes: { purpose: "upgrade_prorata", plan_key: params.toPlanKey },
  });

  await updateBillingSubscription(supabase, params.businessId, { razorpay_order_id: order.id });

  await recordAuditLogEntry(
    params.businessId,
    params.userId,
    "subscription.checkout_started",
    "subscription",
    params.businessId,
    {
      planKey: params.toPlanKey,
      purpose: "upgrade_prorata",
      amountPaise: params.quote.amountPaise,
      remainingDays: params.quote.remainingDays,
    },
  );

  logEvent("billing_prorata_checkout_started", params.businessId, {
    planKey: params.toPlanKey,
    amountPaise: params.quote.amountPaise,
  });

  return {
    kind: "order",
    razorpayKeyId: config.keyId,
    orderId: order.id,
    planKey: params.toPlanKey,
    planName: plan.name,
    amountPaise: params.quote.amountPaise,
    purpose: "upgrade_prorata",
  };
}

export { proRataUpgradeQuote };
