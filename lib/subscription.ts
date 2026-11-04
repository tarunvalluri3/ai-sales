import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import { sendOpsAlert } from "@/lib/ops-alert";
import { TRIAL_ALREADY_USED_SHORT } from "@/lib/trial-messages";
import { PLAN_KEYS, applyChannelOverrides, type ChannelKey } from "@/lib/plans";
import {
  LastKnownEntitlementStore,
  SUBSCRIPTION_STATUSES,
  applyLaunchSwitches,
  channelAllowed,
  channelLaunchSwitchesFromEnv,
  entitlementConfigFromEnv,
  entitlementFromRow,
  entitlementOnReadFailure,
  lastKnownMaxAgeMsFromEnv,
  noPaidAccessEntitlement,
  type Entitlement,
  type SubscriptionRow,
} from "@/lib/entitlement-rules";

export { SUBSCRIPTION_STATUSES, entitlementFromRow, channelAllowed };
export type { Entitlement, SubscriptionStatus, NotServingReason } from "@/lib/entitlement-rules";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Resolves a business's plan assignment into the facts the rest of the app
 * enforces on: reply quota and period, whether the AI may reply at all, and
 * which channels it may use. The rules themselves are pure and live in
 * lib/entitlement-rules.ts (unit-tested); this module does the reads.
 *
 * Nothing here trusts a client-supplied value: `businessId` always arrives
 * from a validated Clerk session or a server-side lookup (widget key, Meta
 * account id), and the plan key read from the database goes through a Zod
 * enum built from PLAN_KEYS before it is used.
 *
 * FAILURE POLICY (owner decision 2026-11-03; this used to fail OPEN to Scale):
 * - no subscriptions row          -> no paid access (not serving, no Meta channels)
 * - read error / unparseable row  -> the last known plan, re-evaluated now, if it
 *   was read within SUBSCRIPTION_LAST_KNOWN_MAX_HOURS (default 24); otherwise no
 *   paid access. Either way it is logged at "error" level and alerted
 *   (`subscription_read_degraded`; email throttled to one per business per hour).
 */

const subscriptionRowSchema = z.object({
  plan_key: z.enum(PLAN_KEYS),
  status: z.enum(SUBSCRIPTION_STATUSES),
  trial_started_at: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  razorpay_subscription_id: z.string().nullable(),
  billing_interval: z.enum(["monthly", "annual"]).nullable().default(null),
  scheduled_plan_key: z.enum(PLAN_KEYS).nullable().default(null),
  past_due_since: z.string().nullable().default(null),
  razorpay_order_id: z.string().nullable().default(null),
  // Phase 33 Stop 2: an admin-set override of this business's reply quota.
  reply_quota_override: z.number().int().positive().nullable().default(null),
});

/** The columns every entitlement read needs. Kept next to the schema that parses them. */
const ENTITLEMENT_COLUMNS =
  "plan_key, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, razorpay_subscription_id, billing_interval, scheduled_plan_key, past_due_since, razorpay_order_id, reply_quota_override";

/** Process-wide last-known rows (see LastKnownEntitlementStore for why in memory). */
const lastKnown = new LastKnownEntitlementStore();

/**
 * Reads the business's entitlement. Called on every chat turn (through
 * lib/usage-limit.ts), by every channel gate, and by the dashboard pages.
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const [planEntitlement, instagramEnabled] = await Promise.all([
    getPlanEntitlement(supabase, businessId, now),
    readInstagramOverride(supabase, businessId),
  ]);
  // Item 7: deployment-wide launch switches first (a Meta approval not in
  // yet), then the per-business Instagram override (the App Review account).
  return {
    ...planEntitlement,
    channels: applyChannelOverrides(applyLaunchSwitches(planEntitlement.channels, channelLaunchSwitchesFromEnv()), {
      instagramEnabled,
    }),
  };
}

/**
 * `businesses.instagram_enabled` (service-role-only, migration
 * 20261113000000). FAILS CLOSED: a read error means "no override". The
 * override opens Instagram's channel flag only; it never makes a business
 * serve (channelAllowed also requires `serving`).
 */
async function readInstagramOverride(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("businesses")
    .select("instagram_enabled")
    .eq("id", businessId)
    .maybeSingle<{ instagram_enabled: boolean | null }>();
  if (error) {
    logEvent("instagram_override_read_failed", businessId, {}, "error");
    return false;
  }
  return data?.instagram_enabled === true;
}

async function getPlanEntitlement(supabase: SupabaseClient, businessId: string, now: Date): Promise<Entitlement> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(ENTITLEMENT_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return degradedEntitlement(businessId, now, "read_error");

  if (!data) {
    lastKnown.forget(businessId);
    return noPaidAccessEntitlement(now, "no_subscription");
  }

  const parsed = subscriptionRowSchema.safeParse(data);
  if (!parsed.success) {
    // A row this code cannot describe (a plan key or status added to the
    // database ahead of the registry): treated as a read failure, never guessed.
    return degradedEntitlement(businessId, now, "row_invalid");
  }

  const row: SubscriptionRow = parsed.data;
  lastKnown.remember(businessId, row, now.getTime());
  return entitlementFromRow(row, now, entitlementConfigFromEnv());
}

function degradedEntitlement(businessId: string, now: Date, cause: "read_error" | "row_invalid"): Entitlement {
  const { entitlement, outcome } = entitlementOnReadFailure(
    lastKnown,
    businessId,
    now,
    lastKnownMaxAgeMsFromEnv(),
    entitlementConfigFromEnv(),
  );
  const usingLastKnown = outcome.kind === "last_known";
  void sendOpsAlert({
    event: "subscription_read_degraded",
    businessId,
    subject: usingLastKnown
      ? "Subscription read failed: serving the last known plan"
      : "Subscription read failed: no paid access granted",
    paragraphs: [
      usingLastKnown
        ? "A business's subscription could not be read, so its last known plan is being used. This stops automatically once the last known value is older than SUBSCRIPTION_LAST_KNOWN_MAX_HOURS."
        : "A business's subscription could not be read and there was no recent last known plan, so the business has no paid access (its AI is not replying) until the read succeeds.",
      "Check the database and Sentry for subscription_read_degraded.",
    ],
    facts: [
      { label: "Business", value: businessId },
      { label: "Cause", value: cause },
      { label: "Outcome", value: usingLastKnown ? "last_known" : `no_paid_access (${outcome.reason})` },
      ...(usingLastKnown ? [{ label: "Last known age (minutes)", value: String(Math.round(outcome.ageMs / 60_000)) }] : []),
    ],
    throttleKey: `subscription_read_degraded:${businessId}`,
  });
  return entitlement;
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
 * `subscriptions_select_own_business` policy. Null for a business with no row
 * and null on a read error, both of which mean the same thing to the form -- ask.
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
 * Whether the business may use a channel right now. The single gate for both
 * the dashboard page and the action/route that performs the connect -- a
 * Starter customer calling the Server Action directly must be refused by the
 * same check that hid the form.
 */
export async function isChannelEntitled(businessId: string, channel: ChannelKey): Promise<boolean> {
  const entitlement = await getEntitlementForBusiness(businessId);
  return channelAllowed(entitlement, channel);
}

/**
 * The server-side channel gate for paths with no Clerk session (OAuth
 * callbacks, webhooks, the send queues): the business must be serving (trial
 * or paid plan in good standing) AND its plan -- or, for Instagram, its
 * service-role-only override -- must include the channel. Pass the
 * service-role client.
 */
export async function isChannelAllowed(
  supabase: SupabaseClient,
  businessId: string,
  channel: ChannelKey,
): Promise<boolean> {
  const entitlement = await getEntitlement(supabase, businessId);
  return channelAllowed(entitlement, channel);
}

export async function isInstagramAllowed(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  return isChannelAllowed(supabase, businessId, "instagram");
}

export async function isWhatsappAllowed(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  return isChannelAllowed(supabase, businessId, "whatsapp");
}

/** The user-facing refusal when a channel is not available to the business. */
export function channelNotEntitledMessage(channel: ChannelKey, entitlement: Entitlement): string {
  const channelName =
    channel === "whatsapp" ? "WhatsApp messaging" : channel === "instagram" ? "Instagram messaging" : "This channel";
  const switches = channelLaunchSwitchesFromEnv();
  if ((channel === "whatsapp" && !switches.whatsapp) || (channel === "instagram" && !switches.instagram)) {
    return `${channelName} isn't available yet -- we're waiting for Meta's approval. Your website widget works in the meantime.`;
  }
  if (!entitlement.serving) {
    return entitlement.notServingReason === "trial_already_used"
      ? `${channelName} needs a Growth or Scale plan. ${TRIAL_ALREADY_USED_SHORT}`
      : `${channelName} needs an active free trial or a Growth or Scale plan. Choose a plan to switch it on.`;
  }
  return `${channelName} is not included in your ${entitlement.planName} plan. Upgrade to Growth or Scale to connect it.`;
}
