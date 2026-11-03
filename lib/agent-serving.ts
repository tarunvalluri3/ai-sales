import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getEntitlement } from "@/lib/subscription";

/**
 * Whether the live agent may answer prospects right now, decided by the
 * business's subscription and nothing else (billing hardening, 2026-10-29).
 * "Agent" == business: there is no agents table, so `agentId` is the
 * `business_id` the runtime handlers already hold from a validated widget key
 * or channel lookup (docs/security.md 2 and 4), never a client-supplied value.
 *
 * The rule lives in `entitlementFromRow` (lib/subscription.ts), not here, so
 * the dashboard banners, the billing page and the runtime can never disagree:
 * `trialing` and `active` serve; `past_due` serves until the grace period
 * (PAST_DUE_GRACE_DAYS) runs out; `cancelled` serves to the end of the period
 * already paid for; `expired` and an expired trial do not. A business with no
 * subscription row does NOT serve (owner decision 2026-11-03,
 * lib/entitlement-rules.ts).
 *
 * Cached per serverless instance for a few seconds, the same way the widget
 * context is (lib/widget-auth.ts): it saves a database round trip on a busy
 * widget, and a status change made by a webhook on another instance reaches
 * this one within the TTL. Short on purpose -- a lapsed customer must stop
 * being served promptly, and a recovered one must come back promptly.
 *
 * On a read error this follows `getEntitlement`: the last known plan for up
 * to SUBSCRIPTION_LAST_KNOWN_MAX_HOURS, otherwise not serving; logged and
 * alerted there.
 */
const SERVING_CACHE_TTL_MS = 15_000;
const SERVING_CACHE_MAX_ENTRIES = 500;
const servingCache = new Map<string, { expiresAt: number; serving: boolean }>();

export async function canAgentServe(agentId: string, now: number = Date.now()): Promise<boolean> {
  const cached = servingCache.get(agentId);
  if (cached && cached.expiresAt > now) return cached.serving;

  const entitlement = await getEntitlement(createServiceSupabaseClient(), agentId, new Date(now));

  if (servingCache.size >= SERVING_CACHE_MAX_ENTRIES) {
    const oldest = servingCache.keys().next().value;
    if (oldest !== undefined) servingCache.delete(oldest);
  }
  servingCache.set(agentId, { expiresAt: now + SERVING_CACHE_TTL_MS, serving: entitlement.serving });
  return entitlement.serving;
}

/**
 * What a prospect sees on the website widget while the agent is not serving.
 * Deliberately neutral: it says nothing about billing, plans or payment --
 * that is the business owner's concern, not their customer's.
 */
export const AGENT_UNAVAILABLE_MESSAGE = "This assistant is temporarily unavailable.";
