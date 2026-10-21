import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { PLAN_KEYS, type PlanKey } from "@/lib/plans";

/**
 * The Razorpay API client and its configuration. Phase 17b (STATE.md).
 *
 * **TEST MODE ONLY in this phase.** The keys in use are `rzp_test_*`;
 * nothing here has ever charged a real customer and nothing should until
 * Phase 17c issues GST invoices, because taking money from an Indian
 * customer without issuing a tax invoice is not lawful. That is a product
 * decision recorded in STATE.md, not something this module enforces -- it
 * would do exactly the same thing with live keys, which is why the
 * blocker is written down rather than coded around.
 *
 * **Missing configuration is a quiet, explicit "not configured", never a
 * startup crash.** `getRazorpayConfig()` returns `null` and every caller
 * handles that outcome: the billing page explains that payments are not
 * set up, the webhook refuses every request, the cron's billing sweep
 * no-ops. This is the same posture `RESEND_API_KEY` has (lib/email-sender.ts
 * returns `"skipped_no_api_key"`) and the same reason: a developer
 * checking out this repo without Razorpay keys must still be able to run
 * the app, and a production deploy that loses one env var must degrade one
 * feature rather than fail to boot. All six variables are therefore
 * `.optional()` in lib/env.ts.
 *
 * **Secrets.** `RAZORPAY_KEY_ID` is public -- it is handed to the browser
 * so Checkout can open (docs/security.md section 5). `RAZORPAY_KEY_SECRET`
 * and `RAZORPAY_WEBHOOK_SECRET` are not, and are never logged, never
 * returned to a client, and never interpolated into an error message: the
 * error paths below log the Razorpay error *code* and nothing else.
 */

/** Razorpay's REST base. India-only account, so no regional variants. */
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/**
 * The monthly plan ids, one per plan key, created in the Razorpay
 * dashboard at the registry's GST-inclusive gross amounts.
 *
 * **Verified live against the API on 2026-10-21** before anything was
 * built on them -- amount in paise, currency, period and interval -- and
 * all three agreed with `lib/plans.ts`'s `monthlyPricePaise` exactly
 * (149900 / 399900 / 999900 INR, monthly, interval 1). A mismatch here is
 * not a configuration nit: it means billing a customer an amount other
 * than the one /pricing advertises, so `assertPlanMatchesRegistry()` below
 * re-checks it at subscription-creation time rather than trusting that the
 * dashboard has not been edited since.
 *
 * There are no annual plan ids, by design: the annual option is a one-time
 * Order, not a subscription (see `createAnnualOrder`).
 */
const PLAN_ID_ENV_VARS: Readonly<Record<PlanKey, string>> = {
  starter: "RAZORPAY_PLAN_STARTER_MONTHLY",
  growth: "RAZORPAY_PLAN_GROWTH_MONTHLY",
  scale: "RAZORPAY_PLAN_SCALE_MONTHLY",
};

export type RazorpayConfig = {
  /** Public: sent to the browser for Checkout. */
  readonly keyId: string;
  /** Secret: signs API requests and verifies Checkout callbacks. Never leaves the server. */
  readonly keySecret: string;
  readonly monthlyPlanIds: Readonly<Record<PlanKey, string>>;
};

/**
 * The configuration, or `null` when Razorpay is not set up. Returns null
 * if *any* required piece is missing -- a half-configured integration
 * (keys but no plan ids) would fail at the worst possible moment, in the
 * middle of a customer's checkout, so it is treated as not configured at
 * all.
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;

  const monthlyPlanIds: Partial<Record<PlanKey, string>> = {};
  for (const planKey of PLAN_KEYS) {
    const planId = process.env[PLAN_ID_ENV_VARS[planKey]]?.trim();
    if (!planId) return null;
    monthlyPlanIds[planKey] = planId;
  }

  return { keyId, keySecret, monthlyPlanIds: monthlyPlanIds as Record<PlanKey, string> };
}

/** True when checkout can be offered at all. Read by the billing page. */
export function isRazorpayConfigured(): boolean {
  return getRazorpayConfig() !== null;
}

/**
 * The webhook signing secret, separately from the API keys: the webhook
 * route needs only this, and the dashboard's checkout needs only those.
 * Resolved on its own so an endpoint that is configured can keep working
 * when the other half is not.
 */
export function getRazorpayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

/**
 * The public key id for the browser. Returns null rather than throwing so
 * a page can render an explanation instead of a 500.
 *
 * Safe to send to a client: Razorpay's key id is published in every
 * Checkout integration on the internet, and it authorises nothing on its
 * own. The secret is what signs requests, and it never appears in any
 * value this function or any Server Action returns.
 */
export function getRazorpayPublicKeyId(): string | null {
  return getRazorpayConfig()?.keyId ?? null;
}

function authorizationHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

/**
 * Razorpay's error envelope. Only `code` and `reason`/`step` are ever
 * logged -- `description` can echo back request content, and in a billing
 * flow that content includes amounts and customer details.
 */
const razorpayErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    step: z.string().optional(),
    reason: z.string().optional(),
  }),
});

/**
 * One request against the Razorpay API, with the one error convention.
 *
 * Throws `AppError` on any non-2xx, with a user-safe message and the
 * provider's error *code* in the internal message. Deliberately not a
 * result type: every caller is a Server Action or a webhook handler that
 * already has a try/catch funnelling through `logAndGetUserMessage()`, and
 * a silent failure in a payment path is worse than a thrown one.
 */
async function razorpayRequest<T>(
  config: RazorpayConfig,
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; businessId?: string },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      method: options.method,
      headers: {
        Authorization: authorizationHeader(config),
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Razorpay is the system of record for money; a cached response here
      // would be a correctness bug, not a performance win.
      cache: "no-store",
    });
  } catch (cause) {
    throw new AppError(
      "We could not reach our payment provider. Please try again in a moment.",
      `razorpay_request_failed ${options.method} ${path}`,
      cause,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let code = "unknown";
    try {
      const parsed = razorpayErrorSchema.safeParse(JSON.parse(text));
      if (parsed.success) code = parsed.data.error.code ?? "unknown";
    } catch {
      // A non-JSON error body (a gateway HTML page). The status is enough.
    }
    logEvent(
      "razorpay_api_error",
      options.businessId ?? "unknown",
      { path, status: response.status, code },
      "error",
    );
    throw new AppError(
      "Our payment provider refused that request. Please try again, or contact us if it keeps happening.",
      `razorpay_api_error ${options.method} ${path} status=${response.status} code=${code}`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new AppError(
      "We got an unexpected response from our payment provider. Please try again.",
      `razorpay_response_unparseable ${options.method} ${path}`,
      cause,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Plan verification
 * ------------------------------------------------------------------ */

const planResponseSchema = z.object({
  id: z.string(),
  period: z.string(),
  interval: z.number(),
  item: z.object({
    amount: z.number(),
    currency: z.string(),
  }),
});

export type RazorpayPlanCheck = {
  planKey: PlanKey;
  razorpayPlanId: string;
  amountPaise: number;
  currency: string;
  period: string;
  interval: number;
  expectedAmountPaise: number;
  matches: boolean;
};

/**
 * Reads one plan back from Razorpay and compares it with the registry.
 *
 * Called before every subscription create (`createMonthlySubscription`),
 * not only once at setup, because the dashboard can be edited by a human
 * at any time and the failure mode is the one failure mode a billing
 * integration must not have: charging an amount other than the advertised
 * one. One extra API call on a checkout that is already several
 * round-trips long is a cheap way to make that impossible.
 */
export async function checkRazorpayPlan(planKey: PlanKey, expectedAmountPaise: number): Promise<RazorpayPlanCheck> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new AppError(
      "Payments are not set up yet. Please contact us and we will sort it out.",
      "checkRazorpayPlan called with no Razorpay configuration",
    );
  }

  const razorpayPlanId = config.monthlyPlanIds[planKey];
  const raw = await razorpayRequest<unknown>(config, `/plans/${razorpayPlanId}`, { method: "GET" });
  const parsed = planResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "We could not confirm the plan details with our payment provider. Please try again.",
      `razorpay_plan_unexpected_shape ${planKey}`,
    );
  }

  const plan = parsed.data;
  return {
    planKey,
    razorpayPlanId,
    amountPaise: plan.item.amount,
    currency: plan.item.currency,
    period: plan.period,
    interval: plan.interval,
    expectedAmountPaise,
    matches:
      plan.item.amount === expectedAmountPaise &&
      plan.item.currency === "INR" &&
      plan.period === "monthly" &&
      plan.interval === 1,
  };
}

/* ------------------------------------------------------------------ *
 * Subscriptions (the monthly path)
 * ------------------------------------------------------------------ */

/**
 * The lifetime cap on a Razorpay subscription, in billing cycles.
 *
 * **120 = ten years of monthly charges.** Razorpay requires `total_count`
 * and stops billing once it is exhausted, moving the subscription to
 * `completed` -- so a value chosen carelessly is a subscription that
 * silently stops producing revenue years later, with a customer still
 * happily using the product. That is the failure this constant exists to
 * avoid, and it is why it is not simply `12`.
 *
 * Why not Razorpay's documented ceiling (it supports up to 100 years, and
 * 30 years of monthly cycles is 360)? Because a bigger number buys nothing
 * real. No Indian recurring mandate survives ten years untouched -- RBI's
 * e-mandate rules make cards and UPI AutoPay re-authenticate on their own
 * schedule, and cards expire long before then -- so the practical lifetime
 * of any one mandate is years, not decades. 120 is comfortably past that,
 * while still being a bounded commitment rather than an unbounded one.
 *
 * And the end of the count is **handled, not hoped about**:
 * `subscription.completed` is one of the events the webhook processes
 * (lib/razorpay-webhook.ts), which moves our row to `expired`, emails the
 * business and surfaces a re-subscribe prompt on /dashboard/billing. Even
 * if a customer somehow reached cycle 120, it would be a visible event
 * with an email attached, not silence.
 *
 * Verified accepted by the API 2026-10-21: creating a test subscription
 * with `total_count: 120` returned `end_at` ten years out.
 */
export const SUBSCRIPTION_TOTAL_COUNT = 120;

const subscriptionResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  plan_id: z.string(),
  customer_id: z.string().nullable().optional(),
  current_start: z.number().nullable().optional(),
  current_end: z.number().nullable().optional(),
  charge_at: z.number().nullable().optional(),
  start_at: z.number().nullable().optional(),
  short_url: z.string().nullable().optional(),
  has_scheduled_changes: z.boolean().optional(),
});

export type RazorpaySubscription = z.infer<typeof subscriptionResponseSchema>;

/**
 * Creates the Razorpay subscription a customer is about to authorise.
 *
 * The deliberate choices, all four of which change customer-visible
 * behaviour:
 *
 * - **`start_at` is the trial end, not now.** The mandate is authenticated
 *   immediately (the confirmed decision is that a payment method is
 *   required at signup) but the first charge lands when the 14-day trial
 *   ends. Razorpay sets `charge_at` to `start_at`, so nothing is taken in
 *   the meantime.
 * - **`total_count` is SUBSCRIPTION_TOTAL_COUNT** -- see that constant.
 * - **`customer_notify: 0`.** Razorpay does NOT email the customer about
 *   this subscription; we send our own branded mail through
 *   lib/email-sender.ts, in the product's own voice and with the product's
 *   own links. Two providers emailing the same customer about the same
 *   charge is worse than either doing it alone.
 * - **`business_id` goes in `notes` AND the returned id is stored on our
 *   row.** Two independent ways to correlate a webhook back to a tenant,
 *   because each covers the other's blind spot: the stored id fails if the
 *   create succeeded at Razorpay but our write did not, and the note fails
 *   if a subscription was ever created outside this code path. The webhook
 *   tries the stored id first and falls back to the note
 *   (lib/razorpay-webhook.ts).
 *
 * The plan is re-verified against the registry first, so a dashboard edit
 * can never silently change what a customer is charged.
 */
export async function createMonthlySubscription(params: {
  planKey: PlanKey;
  businessId: string;
  expectedAmountPaise: number;
  /** Unix seconds. The trial end -- when the first real charge should land. */
  startAt: number;
}): Promise<RazorpaySubscription> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new AppError(
      "Payments are not set up yet. Please contact us and we will sort it out.",
      "createMonthlySubscription called with no Razorpay configuration",
    );
  }

  const check = await checkRazorpayPlan(params.planKey, params.expectedAmountPaise);
  if (!check.matches) {
    logEvent(
      "razorpay_plan_registry_mismatch",
      params.businessId,
      {
        planKey: params.planKey,
        razorpayAmountPaise: check.amountPaise,
        registryAmountPaise: check.expectedAmountPaise,
        period: check.period,
        interval: check.interval,
        currency: check.currency,
      },
      "error",
    );
    throw new AppError(
      "We could not start that subscription because our pricing is being updated. Please try again shortly, or contact us.",
      `razorpay_plan_registry_mismatch ${params.planKey}`,
    );
  }

  const raw = await razorpayRequest<unknown>(config, "/subscriptions", {
    method: "POST",
    businessId: params.businessId,
    body: {
      plan_id: check.razorpayPlanId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      // 0, not false: Razorpay accepts both and 0 is what its own examples
      // use for "the business handles customer communication".
      customer_notify: 0,
      start_at: params.startAt,
      notes: { business_id: params.businessId, plan_key: params.planKey },
    },
  });

  const parsed = subscriptionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "We got an unexpected response from our payment provider. Please try again.",
      "razorpay_subscription_unexpected_shape",
    );
  }
  return parsed.data;
}

export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription | null> {
  const config = getRazorpayConfig();
  if (!config) return null;
  const raw = await razorpayRequest<unknown>(config, `/subscriptions/${subscriptionId}`, { method: "GET" });
  const parsed = subscriptionResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Cancels a Razorpay subscription.
 *
 * `atCycleEnd` maps straight onto the confirmed cancellation decision:
 * cancel at period end, keeping access until then, which matches the
 * no-refunds/cancel-any-time policy on /refunds. Cancelling immediately
 * would take away access a customer has already paid for and we do not
 * refund, which would be the one genuinely unfair combination.
 *
 * Immediate cancellation (`atCycleEnd: false`) is used only for a mandate
 * that was never charged -- replacing a trialing subscription during a
 * plan change, where there is nothing paid for to protect.
 */
export async function cancelSubscription(
  subscriptionId: string,
  atCycleEnd: boolean,
  businessId?: string,
): Promise<RazorpaySubscription | null> {
  const config = getRazorpayConfig();
  if (!config) return null;
  const raw = await razorpayRequest<unknown>(config, `/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    businessId,
    body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 },
  });
  const parsed = subscriptionResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type SubscriptionPlanUpdateOutcome =
  | { outcome: "updated"; subscription: RazorpaySubscription }
  /**
   * Razorpay refused the update. The documented case this covers is a
   * mandate authorised by UPI AutoPay or eMandate rather than by card:
   * **only card-authorised subscriptions can be updated**. It is not an
   * error in our code and it must not fail the customer's plan change --
   * the caller falls back to cancel-at-period-end plus a re-authorisation
   * prompt (lib/billing-plan-change.ts).
   */
  | { outcome: "refused"; reason: string };

/**
 * Moves a live subscription onto a different plan at the end of the
 * current cycle, so the *next* recurring charge is the new price.
 *
 * Always `cycle_end`, never `now`: changing the plan immediately would
 * make Razorpay charge the new amount against a mandate the customer
 * authorised for a different one, and the money for the remainder of the
 * current period is handled separately and explicitly -- an upgrade pays
 * the pro-rated difference as a one-time order, a downgrade pays nothing
 * (lib/billing-plan-change.ts).
 *
 * Returns `refused` rather than throwing for a provider refusal, because
 * the common refusal (a non-card mandate) is an expected outcome with a
 * designed fallback, not a failure.
 */
export async function updateSubscriptionPlanAtCycleEnd(params: {
  subscriptionId: string;
  planKey: PlanKey;
  businessId: string;
}): Promise<SubscriptionPlanUpdateOutcome> {
  const config = getRazorpayConfig();
  if (!config) return { outcome: "refused", reason: "not_configured" };

  try {
    const raw = await razorpayRequest<unknown>(config, `/subscriptions/${params.subscriptionId}`, {
      method: "POST",
      businessId: params.businessId,
      body: {
        plan_id: config.monthlyPlanIds[params.planKey],
        schedule_change_at: "cycle_end",
        customer_notify: 0,
      },
    });
    const parsed = subscriptionResponseSchema.safeParse(raw);
    if (!parsed.success) return { outcome: "refused", reason: "unexpected_shape" };
    return { outcome: "updated", subscription: parsed.data };
  } catch (error) {
    // Already logged with its provider error code by razorpayRequest.
    logEvent(
      "razorpay_subscription_update_refused",
      params.businessId,
      { planKey: params.planKey },
      "error",
    );
    return { outcome: "refused", reason: error instanceof AppError ? "api_refused" : "unknown" };
  }
}

/* ------------------------------------------------------------------ *
 * Orders (the annual path, and pro-rata upgrade charges)
 * ------------------------------------------------------------------ */

const orderResponseSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
});

export type RazorpayOrder = z.infer<typeof orderResponseSchema>;

/**
 * Creates a one-time order.
 *
 * Used for the two things that are genuinely one-time payments: the annual
 * plan (two months free, so ten months' gross, taken in one authenticated
 * transaction rather than through a mandate that RBI rules would make
 * re-authenticate every year anyway) and the pro-rated difference when a
 * customer upgrades mid-period.
 *
 * `amountPaise` always arrives derived from `lib/plans.ts`. A client never
 * supplies an amount anywhere in this codebase -- that is the whole point
 * of the registry, and an order endpoint that accepted a client-supplied
 * amount would let anyone buy Scale for one rupee.
 */
export async function createOrder(params: {
  amountPaise: number;
  receipt: string;
  businessId: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const config = getRazorpayConfig();
  if (!config) {
    throw new AppError(
      "Payments are not set up yet. Please contact us and we will sort it out.",
      "createOrder called with no Razorpay configuration",
    );
  }

  if (!Number.isInteger(params.amountPaise) || params.amountPaise < 100) {
    // A defensive floor, not a business rule: every real amount here comes
    // from the registry. A non-integer or sub-rupee amount means a
    // derivation bug upstream, and sending it to Razorpay would turn that
    // bug into a wrong charge.
    throw new AppError(
      "We could not work out the amount for that change. Please contact us.",
      `razorpay_order_amount_invalid ${params.amountPaise}`,
    );
  }

  const raw = await razorpayRequest<unknown>(config, "/orders", {
    method: "POST",
    businessId: params.businessId,
    body: {
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt.slice(0, 40),
      notes: { ...params.notes, business_id: params.businessId },
    },
  });

  const parsed = orderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "We got an unexpected response from our payment provider. Please try again.",
      "razorpay_order_unexpected_shape",
    );
  }
  return parsed.data;
}
