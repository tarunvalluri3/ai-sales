import {
  PAST_DUE_GRACE_DAYS,
  PLANS,
  TRIAL_CHANNELS,
  TRIAL_REPLY_QUOTA,
  type ChannelKey,
  type PlanKey,
} from "@/lib/plans";

/**
 * The pure half of lib/subscription.ts: how one `subscriptions` row (or the
 * absence of one, or a failed read) becomes the entitlement the app enforces.
 * No I/O and no `server-only`, so every rule is unit-tested without a database
 * (scripts/run-plan-access-tests.mjs).
 *
 * Owner decisions (2026-11-03), enforced here:
 * - A missing subscription row grants NO paid access (it used to grant Scale).
 * - If the subscription read fails, the last known entitlement is kept for up
 *   to SUBSCRIPTION_LAST_KNOWN_MAX_HOURS (default 24); with none, no paid access.
 * - The free trial needs no card, includes website + WhatsApp + Instagram, and
 *   is hard-capped at TRIAL_REPLY_QUOTA replies (default 200) and 14 days.
 * - One trial per organisation, enforced in the database (trial_grants,
 *   migration 20261121000000); a trial-already-used business gets an
 *   'expired' row, surfaced here as `trial_already_used`.
 */

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type NotServingReason =
  | "trial_expired"
  | "trial_already_used"
  | "grace_period_lapsed"
  | "subscription_expired"
  | "no_subscription"
  | "subscription_unavailable";

/** A validated `subscriptions` row (lib/subscription.ts parses it with Zod). */
export type SubscriptionRow = {
  plan_key: PlanKey;
  status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  razorpay_subscription_id: string | null;
  billing_interval: "monthly" | "annual" | null;
  scheduled_plan_key: PlanKey | null;
  past_due_since: string | null;
  razorpay_order_id: string | null;
  reply_quota_override: number | null;
};

export type Entitlement = {
  planKey: PlanKey;
  planName: string;
  status: SubscriptionStatus;
  /**
   * True when the business has no `subscriptions` row, or the row could not be
   * read and no recent last-known entitlement exists. Grants no paid access.
   */
  noSubscription: boolean;
  /** True when this entitlement is a cached last-known value served during a read failure. */
  fromLastKnown: boolean;
  isTrial: boolean;
  /** AI replies allowed in the period below. The trial cap while trialing. */
  replyQuota: number;
  /** ISO. The window `ai_response_metrics` rows are counted over. */
  periodStart: string;
  periodEnd: string;
  /**
   * False means the AI must not reply at all, independently of quota. The
   * prospect gets the human-follow-up path (lib/rag.ts), never a broken widget.
   */
  serving: boolean;
  notServingReason: NotServingReason | null;
  channels: Readonly<Record<ChannelKey, boolean>>;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledPlanKey: PlanKey | null;
  billingInterval: "monthly" | "annual" | null;
  /** True once a mandate or an annual order exists (money authorised at least once). */
  hasPaymentMethod: boolean;
  pastDueSince: string | null;
  graceUntil: string | null;
};

export type EntitlementConfig = {
  trialReplyQuota: number;
};

/* ------------------------------------------------------------------ *
 * Configuration (env), parsed defensively: a malformed value falls back to
 * the default rather than throwing on the chat path. lib/env.ts validates the
 * same keys at startup so a typo is still caught loudly.
 * ------------------------------------------------------------------ */

export const DEFAULT_LAST_KNOWN_MAX_HOURS = 24;
const MAX_TRIAL_REPLY_QUOTA = 100_000;
const MAX_LAST_KNOWN_HOURS = 168;

/** TRIAL_REPLY_QUOTA: whole number 1-100000. Default 200 (lib/plans.ts). */
export function parseTrialReplyQuota(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return TRIAL_REPLY_QUOTA;
  const value = Number(raw.trim());
  return value >= 1 && value <= MAX_TRIAL_REPLY_QUOTA ? value : TRIAL_REPLY_QUOTA;
}

/** SUBSCRIPTION_LAST_KNOWN_MAX_HOURS: 0-168, decimals allowed; 0 disables the fallback. Default 24. */
export function parseLastKnownMaxHours(raw: string | undefined): number {
  if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) return DEFAULT_LAST_KNOWN_MAX_HOURS;
  const value = Number(raw.trim());
  return value >= 0 && value <= MAX_LAST_KNOWN_HOURS ? value : DEFAULT_LAST_KNOWN_MAX_HOURS;
}

export function entitlementConfigFromEnv(env: Record<string, string | undefined> = process.env): EntitlementConfig {
  return { trialReplyQuota: parseTrialReplyQuota(env.TRIAL_REPLY_QUOTA) };
}

export function lastKnownMaxAgeMsFromEnv(env: Record<string, string | undefined> = process.env): number {
  return parseLastKnownMaxHours(env.SUBSCRIPTION_LAST_KNOWN_MAX_HOURS) * 60 * 60 * 1000;
}

/* ------------------------------------------------------------------ */

function startOfCurrentUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfNextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Website only, nothing serving: what "no paid access" looks like to the rest of the app. */
const NO_PAID_CHANNELS: Readonly<Record<ChannelKey, boolean>> = { website: true, whatsapp: false, instagram: false };

/**
 * No subscription row, or a failed read with no usable last-known value. The
 * AI does not reply and no paid channel is open. `planKey` is "starter" only
 * so the billing UI has something to pre-select; nothing is granted from it.
 */
export function noPaidAccessEntitlement(
  now: Date,
  reason: Extract<NotServingReason, "no_subscription" | "subscription_unavailable">,
): Entitlement {
  const plan = PLANS.starter;
  return {
    planKey: plan.key,
    planName: plan.name,
    status: "expired",
    noSubscription: true,
    fromLastKnown: false,
    isTrial: false,
    replyQuota: 0,
    periodStart: startOfCurrentUtcMonth(now).toISOString(),
    periodEnd: startOfNextUtcMonth(now).toISOString(),
    serving: false,
    notServingReason: reason,
    channels: NO_PAID_CHANNELS,
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
 * Turns a validated row into the facts above. The lifecycle rules:
 * - `trialing`: capped at the trial quota (never the plan's), over the trial
 *   window, with the trial channels (website + WhatsApp + Instagram). Past
 *   trial_ends_at it stops even with replies left.
 * - `active` / `past_due`: the plan's quota; serving until the grace window
 *   `max(current_period_end, past_due_since + PAST_DUE_GRACE_DAYS)` (or
 *   period end + grace when past_due_since is unknown).
 * - `cancelled`: serving to current_period_end, no grace.
 * - `expired`: never serving. An expired row that never had a trial or a
 *   payment is the "trial already used" row from migration 20261121000000.
 * A not-serving entitlement keeps the plan's channels for display, but every
 * channel gate also requires `serving` (see `channelAllowed`).
 */
export function entitlementFromRow(row: SubscriptionRow, now: Date, config: EntitlementConfig): Entitlement {
  const plan = PLANS[row.plan_key];
  const hasPaymentMethod = row.razorpay_subscription_id !== null || row.razorpay_order_id !== null;
  const base = {
    planKey: plan.key,
    planName: plan.name,
    status: row.status,
    noSubscription: false,
    fromLastKnown: false,
    channels: plan.channels as Readonly<Record<ChannelKey, boolean>>,
    trialEndsAt: row.status === "trialing" ? row.trial_ends_at : null,
    cancelAtPeriodEnd: row.cancel_at_period_end || row.status === "cancelled",
    scheduledPlanKey: row.scheduled_plan_key,
    billingInterval: row.billing_interval,
    hasPaymentMethod,
    pastDueSince: row.past_due_since,
    graceUntil: null as string | null,
  };

  if (row.status === "trialing") {
    const trialStart = row.trial_started_at ?? startOfCurrentUtcMonth(now).toISOString();
    const trialEnd = row.trial_ends_at ?? startOfNextUtcMonth(now).toISOString();
    const expired = now.getTime() > new Date(trialEnd).getTime();
    // A trialist who has already checked out (mandate deferred to trial end)
    // keeps the trial channels too: the trial includes every channel either way.
    return {
      ...base,
      channels: TRIAL_CHANNELS,
      isTrial: true,
      replyQuota: row.reply_quota_override ?? config.trialReplyQuota,
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
  let notServingReason: NotServingReason | null = null;
  if (row.status === "expired") {
    serving = false;
    notServingReason =
      row.trial_started_at === null && !hasPaymentMethod ? "trial_already_used" : "subscription_expired";
  } else if (row.status === "cancelled") {
    serving = nowMs <= periodEndMs;
    notServingReason = serving ? null : "subscription_expired";
  } else {
    const periodGraceEndMs = addDays(new Date(periodEnd), PAST_DUE_GRACE_DAYS).getTime();
    const failureGraceEndMs = row.past_due_since
      ? addDays(new Date(row.past_due_since), PAST_DUE_GRACE_DAYS).getTime()
      : null;
    const graceEndMs = failureGraceEndMs === null ? periodGraceEndMs : Math.max(periodEndMs, failureGraceEndMs);
    serving = nowMs <= graceEndMs;
    notServingReason = serving ? null : "grace_period_lapsed";
    if (row.status === "past_due") base.graceUntil = new Date(graceEndMs).toISOString();
  }

  return {
    ...base,
    isTrial: false,
    replyQuota: row.reply_quota_override ?? plan.monthlyReplyQuota,
    periodStart,
    periodEnd,
    serving,
    notServingReason,
  };
}

/**
 * THE channel gate: the entitlement must be serving AND include the channel.
 * A lapsed trial or subscription therefore closes WhatsApp and Instagram, not
 * just the AI. (The website widget is gated by `serving` in the chat path.)
 */
export function channelAllowed(entitlement: Pick<Entitlement, "serving" | "channels">, channel: ChannelKey): boolean {
  return entitlement.serving && entitlement.channels[channel];
}

/* ------------------------------------------------------------------ *
 * Last-known entitlement, for read failures.
 *
 * Kept in process memory: when the subscriptions read fails the database is
 * the thing that is failing, so a database-backed cache would fail with it.
 * On the single-process VPS this covers every request; after a restart there
 * is no last-known value until the first successful read, and a failure in
 * that window grants no paid access (the owner's rule).
 * ------------------------------------------------------------------ */

export type LastKnownLookup =
  | { kind: "last_known"; row: SubscriptionRow; ageMs: number }
  | { kind: "none"; reason: "never_seen" | "too_old" | "disabled" };

/**
 * Remembers the last successfully read ROW (not the derived entitlement), so a
 * fallback is re-evaluated at the current time: a trial or paid period that
 * ends during an outage still ends on time.
 */
export class LastKnownEntitlementStore {
  private readonly entries = new Map<string, { row: SubscriptionRow; at: number }>();
  private readonly maxEntries: number;

  constructor(maxEntries = 5_000) {
    this.maxEntries = maxEntries;
  }

  remember(businessId: string, row: SubscriptionRow, atMs: number): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(businessId)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.delete(businessId);
    this.entries.set(businessId, { row, at: atMs });
  }

  /** A confirmed "no row" read: there is no plan to fall back to any more. */
  forget(businessId: string): void {
    this.entries.delete(businessId);
  }

  lookup(businessId: string, nowMs: number, maxAgeMs: number): LastKnownLookup {
    if (maxAgeMs <= 0) return { kind: "none", reason: "disabled" };
    const entry = this.entries.get(businessId);
    if (!entry) return { kind: "none", reason: "never_seen" };
    const ageMs = nowMs - entry.at;
    if (ageMs > maxAgeMs) return { kind: "none", reason: "too_old" };
    return { kind: "last_known", row: entry.row, ageMs };
  }
}

/**
 * Applies the owner's read-failure rule: the last known plan (if read within
 * `maxAgeMs`), re-evaluated now, else no paid access. Pure: the caller logs and
 * alerts on the returned `outcome`.
 */
export function entitlementOnReadFailure(
  store: LastKnownEntitlementStore,
  businessId: string,
  now: Date,
  maxAgeMs: number,
  config: EntitlementConfig,
): { entitlement: Entitlement; outcome: LastKnownLookup } {
  const outcome = store.lookup(businessId, now.getTime(), maxAgeMs);
  if (outcome.kind === "last_known") {
    return { entitlement: { ...entitlementFromRow(outcome.row, now, config), fromLastKnown: true }, outcome };
  }
  return { entitlement: noPaidAccessEntitlement(now, "subscription_unavailable"), outcome };
}
