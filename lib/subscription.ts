import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import {
  PAST_DUE_GRACE_DAYS,
  PLAN_KEYS,
  PLANS,
  TRIAL_REPLY_QUOTA,
  type ChannelKey,
  type PlanKey,
} from "@/lib/plans";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Resolves a business's plan assignment into the handful of facts the rest
 * of the app actually enforces on: how many AI replies it may use, over
 * what period, whether the AI should reply at all, and which channels it
 * may connect. Phase 17a (STATE.md).
 *
 * Everything here is derived from one row of `public.subscriptions` plus
 * the plan registry in lib/plans.ts. Nothing in this module trusts a
 * client-supplied value: `businessId` always arrives from a validated
 * Clerk session or from the widget-key lookup (docs/security.md 2 and 4),
 * and the plan key read from the database goes through a Zod enum built
 * from PLAN_KEYS before it is used.
 */

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * THE DEFAULT FOR A BUSINESS WITH NO SUBSCRIPTION ROW, which today is
 * every tenant: Scale entitlements, `active`, on a UTC-calendar-month
 * period.
 *
 * Why Scale and not Starter or an expired trial. These tenants predate
 * billing entirely -- none was ever sold a plan, so any plan assigned here
 * is this app's own choice about what to take away, not a contract being
 * honoured. The live tenant already has a connected WhatsApp number
 * (`whatsapp_connections`, 2026-09-09) and uses workflows and the Copilot,
 * all of which only Growth and Scale include, so defaulting to Starter
 * would disconnect a working channel by migration; defaulting to a
 * finished trial would stop its AI replying to real prospects. Both are
 * "nothing breaks for existing tenants" failures. Scale keeps every
 * capability they have today and raises the reply ceiling from the old
 * global token budget's rough ~500 replies to 10,000, so no existing
 * tenant loses anything at all.
 *
 * Why a calendar month: that is exactly the window
 * `AI_MONTHLY_TOKEN_LIMIT` was counted over before Phase 17a, so a
 * grandfathered business's quota period does not silently shift the day
 * this ships.
 *
 * This is a transitional default, not the product's shape. Phase 17b
 * writes a real row at checkout (and a `trialing` row at signup), after
 * which the absent-row case only ever covers pre-billing tenants.
 */
const GRANDFATHERED_PLAN_KEY: PlanKey = "scale";

const subscriptionRowSchema = z.object({
  plan_key: z.enum(PLAN_KEYS),
  status: z.enum(SUBSCRIPTION_STATUSES),
  trial_started_at: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  razorpay_subscription_id: z.string().nullable(),
  // Phase 17b. All nullable, so a pre-17b row (and the whole
  // grandfathered, row-less case) behaves exactly as it did before.
  billing_interval: z.enum(["monthly", "annual"]).nullable().default(null),
  scheduled_plan_key: z.enum(PLAN_KEYS).nullable().default(null),
  past_due_since: z.string().nullable().default(null),
  razorpay_order_id: z.string().nullable().default(null),
  // Phase 33 Stop 2 (docs/phases.md): an admin-set override of this
  // business's reply quota, independent of plan/trial status. Nullable,
  // same precedent as every other post-17a column here -- null changes
  // nothing about the existing plan-based resolution below.
  reply_quota_override: z.number().int().positive().nullable().default(null),
});

/** The columns every entitlement read needs. Kept next to the schema that parses them. */
const ENTITLEMENT_COLUMNS =
  "plan_key, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, razorpay_subscription_id, billing_interval, scheduled_plan_key, past_due_since, razorpay_order_id, reply_quota_override";

export type Entitlement = {
  planKey: PlanKey;
  planName: string;
  status: SubscriptionStatus;
  /** True when no `subscriptions` row exists -- see GRANDFATHERED_PLAN_KEY. */
  grandfathered: boolean;
  isTrial: boolean;
  /** AI replies allowed in the period below. TRIAL_REPLY_QUOTA while trialing. */
  replyQuota: number;
  /** ISO. The window `ai_response_metrics` rows are counted over. */
  periodStart: string;
  periodEnd: string;
  /**
   * False means the AI must not reply at all, independently of quota --
   * an expired trial, a terminal subscription, or a past-due grace period
   * that has run out. The prospect gets the same human-follow-up path as
   * an exhausted quota (lib/rag.ts's USAGE_QUOTA_EXCEEDED_MESSAGE), never
   * a broken widget.
   */
  serving: boolean;
  notServingReason: null | "trial_expired" | "grace_period_lapsed" | "subscription_expired";
  channels: Readonly<Record<ChannelKey, boolean>>;

  /* --- Phase 17b: what /dashboard/billing needs to render honestly --- */

  /** ISO, or null outside a trial. */
  trialEndsAt: string | null;
  /** True when the plan is cancelled or set to cancel, so nothing renews. */
  cancelAtPeriodEnd: boolean;
  /**
   * A downgrade waiting for the period boundary. The *current* plan's quota
   * and channels still apply until then -- which is exactly why a
   * downgrade can never put a business over its new quota mid-period.
   */
  scheduledPlanKey: PlanKey | null;
  /** 'monthly' = a Razorpay mandate. 'annual' = a one-time order. Null before checkout. */
  billingInterval: "monthly" | "annual" | null;
  /**
   * True once a mandate or an annual order exists for this business -- i.e.
   * money has been authorised at least once. Distinguishes "trialing, card
   * on file, will convert" from "trialing, never checked out, will simply
   * stop", which are the same `status` but very different situations to
   * show a customer (and the second is what `trial_ending_3d` mails about).
   */
  hasPaymentMethod: boolean;
  /** ISO. When a renewal first failed, i.e. when the grace period started. */
  pastDueSince: string | null;
  /**
   * ISO. When the grace period ends and the agent stops serving. Set only
   * while `status` is `past_due` (derived from `past_due_since` and
   * PAST_DUE_GRACE_DAYS, not stored), null otherwise.
   */
  graceUntil: string | null;
};

function startOfCurrentUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfNextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function grandfatheredEntitlement(now: Date): Entitlement {
  const plan = PLANS[GRANDFATHERED_PLAN_KEY];
  return {
    planKey: plan.key,
    planName: plan.name,
    status: "active",
    grandfathered: true,
    isTrial: false,
    replyQuota: plan.monthlyReplyQuota,
    periodStart: startOfCurrentUtcMonth(now).toISOString(),
    periodEnd: startOfNextUtcMonth(now).toISOString(),
    serving: true,
    notServingReason: null,
    channels: plan.channels,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    scheduledPlanKey: null,
    billingInterval: null,
    hasPaymentMethod: false,
    pastDueSince: null,
    graceUntil: null,
  };
}

/**
 * Turns a validated row into the facts above. Pure and synchronous, so the
 * lifecycle rules are testable without a database and readable in one
 * place.
 *
 * The rules, and why each is what it is:
 * - `trialing`: the cap is TRIAL_REPLY_QUOTA (200), never the plan's own
 *   quota, and the period is the trial window. Past trial_ends_at the AI
 *   stops even with replies left -- the trial is 14 days *and* 200 replies,
 *   whichever runs out first.
 * - `active`: the plan's quota over the stored billing period. If
 *   current_period_end has already passed (a renewal webhook that has not
 *   landed yet), the grace window applies rather than an immediate stop:
 *   a paying customer must not be cut off because our own webhook is late.
 * - `past_due`: identical to active -- full quota, AI still replying --
 *   until PAST_DUE_GRACE_DAYS (5) past the moment the payment first
 *   failed. The confirmed 5-day grace.
 *
 *   **Phase 17b anchored that window to `past_due_since` rather than to
 *   `current_period_end`.** Razorpay retries a failed charge over several
 *   days and fires `subscription.pending` again on each retry, so a grace
 *   measured from the period end was fine for the first failure and wrong
 *   for a renewal that fails repeatedly -- and a grace re-stamped on each
 *   retry would never end at all. The window is `max(current_period_end,
 *   past_due_since + 5 days)`: never shorter than the period the customer
 *   has already paid for, and never restarted. A row with no
 *   `past_due_since` (pre-17b, or a status set by hand) keeps 17a's
 *   period-end behaviour exactly.
 * - `cancelled`: paid through current_period_end, so it keeps serving to
 *   that moment and then stops. No grace -- this one is the customer's own
 *   decision, not a failed payment.
 * - `expired`: terminal, never serving.
 */
export function entitlementFromRow(row: z.infer<typeof subscriptionRowSchema>, now: Date): Entitlement {
  const plan = PLANS[row.plan_key];
  const base = {
    planKey: plan.key,
    planName: plan.name,
    status: row.status,
    grandfathered: false,
    channels: plan.channels,
    trialEndsAt: row.status === "trialing" ? row.trial_ends_at : null,
    cancelAtPeriodEnd: row.cancel_at_period_end || row.status === "cancelled",
    scheduledPlanKey: row.scheduled_plan_key,
    billingInterval: row.billing_interval,
    hasPaymentMethod: row.razorpay_subscription_id !== null || row.razorpay_order_id !== null,
    pastDueSince: row.past_due_since,
    graceUntil: null as string | null,
  };

  if (row.status === "trialing") {
    // Non-null by the subscriptions_trial_dates_present check constraint;
    // the fallbacks exist only so this function cannot throw on a row that
    // predates a constraint change.
    const trialStart = row.trial_started_at ?? startOfCurrentUtcMonth(now).toISOString();
    const trialEnd = row.trial_ends_at ?? startOfNextUtcMonth(now).toISOString();
    const expired = now.getTime() > new Date(trialEnd).getTime();
    return {
      ...base,
      isTrial: true,
      // Phase 33 Stop 2: an admin override replaces the trial's 200-reply
      // cap too -- a support action to temporarily raise a specific
      // tenant's ceiling, independent of plan/trial status.
      replyQuota: row.reply_quota_override ?? TRIAL_REPLY_QUOTA,
      periodStart: trialStart,
      periodEnd: trialEnd,
      serving: !expired,
      notServingReason: expired ? "trial_expired" : null,
    };
  }

  const periodStart = row.current_period_start ?? startOfCurrentUtcMonth(now).toISOString();
  const periodEnd = row.current_period_end ?? startOfNextUtcMonth(now).toISOString();
  const periodEndMs = new Date(periodEnd).getTime();
  const nowMs = now.getTime();

  let serving: boolean;
  let notServingReason: Entitlement["notServingReason"] = null;
  if (row.status === "expired") {
    serving = false;
    notServingReason = "subscription_expired";
  } else if (row.status === "cancelled") {
    serving = nowMs <= periodEndMs;
    notServingReason = serving ? null : "subscription_expired";
  } else {
    // active and past_due: the 5-day grace. Anchored to the first failed
    // payment when we have it, and never shorter than the period the
    // customer already paid for -- see this function's doc comment.
    const periodGraceEndMs = addDays(new Date(periodEnd), PAST_DUE_GRACE_DAYS).getTime();
    const failureGraceEndMs = row.past_due_since
      ? addDays(new Date(row.past_due_since), PAST_DUE_GRACE_DAYS).getTime()
      : null;
    const graceEndMs =
      failureGraceEndMs === null
        ? periodGraceEndMs
        : Math.max(new Date(periodEnd).getTime(), failureGraceEndMs);
    serving = nowMs <= graceEndMs;
    notServingReason = serving ? null : "grace_period_lapsed";
    if (row.status === "past_due") base.graceUntil = new Date(graceEndMs).toISOString();
  }

  return {
    ...base,
    isTrial: false,
    // Phase 33 Stop 2: see the trialing branch above.
    replyQuota: row.reply_quota_override ?? plan.monthlyReplyQuota,
    periodStart,
    periodEnd,
    serving,
    notServingReason,
  };
}

/**
 * Reads the business's entitlement. Called on every chat turn (through
 * lib/usage-limit.ts) and by the channel pages and connect actions.
 *
 * FAILS OPEN, deliberately and in the same shape as every other
 * best-effort read on the public chat path: a `subscriptions` read error
 * resolves to the grandfathered default, which serves. A database blip
 * must never be the reason a paying customer's widget goes quiet. The
 * error is logged at "error" level so Sentry sees it (lib/logger.ts).
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(ENTITLEMENT_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    logEvent("subscription_read_failed", businessId, {}, "error");
    return grandfatheredEntitlement(now);
  }

  if (!data) return grandfatheredEntitlement(now);

  const parsed = subscriptionRowSchema.safeParse(data);
  if (!parsed.success) {
    // A row this app's own code cannot describe (a plan key or status
    // added to the database ahead of the registry). Treated as a read
    // failure rather than guessed at, for the same reason rule 4 in
    // AGENTS.md 3 exists: a wrong entitlement is worse than a default one.
    logEvent("subscription_row_invalid", businessId, {}, "error");
    return grandfatheredEntitlement(now);
  }

  return entitlementFromRow(parsed.data, now);
}

/**
 * For the dashboard pages and Server Actions, which resolve a business
 * through `requireBusinessContext()` and hold no Supabase client of their
 * own. Always the Clerk-session client, never the service-role one: a
 * business reading its own plan is exactly what the SELECT policy is for.
 */
export async function getEntitlementForBusiness(businessId: string): Promise<Entitlement> {
  return getEntitlement(createServerSupabaseClient(), businessId);
}

/**
 * The place-of-supply details /dashboard/billing pre-fills its checkout
 * form with, so a returning customer is not asked for their state twice.
 *
 * Read with the **Clerk-session** client, i.e. behind the
 * `subscriptions_select_own_business` policy: a business reading its own
 * billing address is exactly what that SELECT grant is for. Null for a
 * business with no row yet (every grandfathered tenant) and null on a read
 * error, both of which mean the same thing to the form -- ask.
 */
export async function getBillingIdentityForBusiness(
  businessId: string,
): Promise<{ name: string | null; address: string | null; stateCode: string | null; gstin: string | null } | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("billing_name, billing_address, billing_state_code, gstin")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    name: data.billing_name ?? null,
    address: data.billing_address ?? null,
    stateCode: data.billing_state_code ?? null,
    gstin: data.gstin ?? null,
  };
}

/**
 * Whether the business's plan includes a channel. The single gate for
 * both the dashboard page and the action/route that performs the connect
 * -- a Starter customer calling the Server Action directly must be
 * refused by the same check that hid the form.
 */
export async function isChannelEntitled(businessId: string, channel: ChannelKey): Promise<boolean> {
  const entitlement = await getEntitlementForBusiness(businessId);
  return entitlement.channels[channel];
}

/** The user-facing refusal when a channel is not on the business's plan. */
export function channelNotEntitledMessage(channel: ChannelKey, entitlement: Entitlement): string {
  if (channel === "instagram") {
    return "Instagram messaging is not available on any plan yet -- it needs approval from Meta before we can serve an account we don't manage ourselves. Ask us and we'll tell you honestly where it stands.";
  }
  const channelName = channel === "whatsapp" ? "WhatsApp messaging" : "This channel";
  return `${channelName} is not included in your ${entitlement.planName} plan. Upgrade to Growth or Scale to connect it.`;
}
