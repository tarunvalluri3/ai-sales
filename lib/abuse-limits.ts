/**
 * Phase 32 (STATE.md): the pure, network-free core of the abuse rate-limit
 * scopes -- the limit numbers, the trial-vs-normal burst profile selection,
 * the log-only/fail-open verdict logic, the IPv4 /24 derivation and the
 * new-conversation predicate.
 *
 * Deliberately NOT "server-only" and free of any Node/Next/Supabase import,
 * for the same reason lib/chat-stream.ts is: scripts/run-abuse-limit-tests.mjs
 * imports this module directly through the @/* alias resolver and exercises
 * every branch with no database. The server-only callers
 * (lib/rate-limit.ts, app/api/chat/route.ts, the two webhooks) consume these
 * helpers; the numbers and the decisions live here, in one testable place.
 *
 * Everything added here ships in LOG-ONLY mode (decision 2): the checks run
 * and record a would-exceed verdict, but a trip never blocks a request until
 * a scope is promoted to enforcing in a separate, later change. The starting
 * numbers below are guesses to be replaced by real percentiles.
 */
import type { RateLimitScope } from "@/lib/rate-limit";
import type { SubscriptionStatus } from "@/lib/subscription";

/**
 * The limit + window for each Phase 32 scope, in one place rather than
 * scattered across call sites. `business_burst_trial` is a limit *profile*,
 * not a scope value -- both profiles write rows under the `business_burst`
 * scope (so the DB check constraint gains three values, not four). A
 * trialing tenant has only 200 replies total (TRIAL_REPLY_QUOTA), so its
 * burst ceiling is far tighter than a paid tenant's (decision 3). Both burst
 * profiles share the same window, so the raw counter increment needs only
 * `business_burst.windowSeconds` regardless of profile.
 */
export const SCOPE_LIMITS = {
  business_burst: { limit: 150, windowSeconds: 300 },
  business_burst_trial: { limit: 40, windowSeconds: 300 },
  new_conversation_ip: { limit: 10, windowSeconds: 3600 },
  ip_subnet: { limit: 150, windowSeconds: 300 },
} as const;

/**
 * The abuse scopes that only ever RECORD a trip during the observation
 * window -- a would-exceed verdict is logged, but the request is still
 * allowed. Promotion to enforcing is a separate change once real data
 * exists (decision 2), done by removing a scope from this set.
 */
export const LOG_ONLY_SCOPES: ReadonlySet<RateLimitScope> = new Set([
  "business_burst",
  "new_conversation_ip",
  "ip_subnet",
]);

/**
 * The abuse scopes that FAIL OPEN on an infrastructure error -- a counter
 * read failing must never take down a tenant's widget (Phase 32). The
 * pre-existing scopes (ip / key / conversation / the poll and webhook
 * scopes) keep their original fail-CLOSED behaviour in lib/rate-limit.ts and
 * are deliberately not listed here.
 */
export const FAIL_OPEN_SCOPES: ReadonlySet<RateLimitScope> = new Set([
  "business_burst",
  "new_conversation_ip",
  "ip_subnet",
]);

/**
 * Picks the burst ceiling for a tenant from its subscription status: the
 * tighter trial profile for a `trialing` tenant, the normal profile for
 * everyone else. The status comes from the entitlement the quota check
 * already loaded, so this costs no extra query (decision 3).
 */
export function selectBurstLimit(status: SubscriptionStatus): { limit: number; windowSeconds: number } {
  return status === "trialing" ? SCOPE_LIMITS.business_burst_trial : SCOPE_LIMITS.business_burst;
}

export type RateLimitVerdict = {
  /** Whether the request is allowed through. */
  allowed: boolean;
  /**
   * True only when a LOG-ONLY scope is over its limit -- i.e. this request
   * WOULD have been blocked if the scope were enforcing. The caller logs a
   * `rate_limit_would_exceed` event for it; `allowed` stays true.
   */
  wouldExceed: boolean;
};

/**
 * The verdict for one counter result, shared by every scope so the behaviour
 * is identical across call sites and testable without a database. `count` is
 * the new counter value, or `null` when the increment hit an infrastructure
 * error.
 *
 * - error (`count === null`): a fail-open scope is allowed; every other
 *   scope is refused (fail closed -- unchanged for the pre-existing scopes).
 * - over limit on a log-only scope: allowed, but flagged `wouldExceed`.
 * - over limit on an enforcing scope: refused.
 * - within limit: allowed.
 */
export function resolveAbuseLimitVerdict(scope: RateLimitScope, count: number | null, limit: number): RateLimitVerdict {
  if (count === null) {
    return { allowed: FAIL_OPEN_SCOPES.has(scope), wouldExceed: false };
  }
  const overLimit = count > limit;
  if (overLimit && LOG_ONLY_SCOPES.has(scope)) {
    return { allowed: true, wouldExceed: true };
  }
  return { allowed: !overLimit, wouldExceed: false };
}

/**
 * The /24 network of an IPv4 address ("203.0.113.47" -> "203.0.113.0/24"),
 * the identifier for the `ip_subnet` scope. Returns null for anything that
 * is not a canonical dotted-quad IPv4 -- an IPv6 address, the "unknown"
 * sentinel extractIp() returns when no forwarded-for header is present, or
 * any malformed value -- so the caller SKIPS the check rather than bucketing
 * wrongly (decision 5: a wrong IPv6 prefix either does nothing or collapses
 * a whole ISP into one bucket). extractIp()'s own contract is untouched;
 * this is a separate, pure derivation on top of it.
 */
export function deriveIpv4Subnet(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  for (const part of parts) {
    // Reject empty, non-digit, over-long, or scientific/sign forms that
    // Number() would otherwise coerce (e.g. "1e2", "+1", " 1").
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Whether the `new_conversation_ip` check applies to this request: only when
 * the body carries no conversationId, which is the specific hole it closes
 * (decision 4) -- a script that drops the id each turn creates a fresh
 * conversation and so never binds the per-conversation scope. Limiting every
 * request by IP again would just duplicate the existing `ip` scope.
 */
export function requiresNewConversationCheck(conversationId: string | null | undefined): boolean {
  return !conversationId;
}
