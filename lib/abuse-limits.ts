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
  // 30, not the original 10: a whole office or mobile-carrier NAT shares one
  // IP, and 10 new chats an hour would trip real visitors once enforcing.
  new_conversation_ip: { limit: 30, windowSeconds: 3600 },
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

/**
 * Stage D (STATE.md): how a tripped abuse scope is answered once it is
 * ENFORCING. Nothing here takes effect while a scope is in LOG_ONLY_SCOPES
 * (its verdict is always `allowed`), so wiring it in changes no live
 * behaviour; promoting a scope is still just removing it from that set.
 *
 * - `hard`: refuse with a bare 429 BEFORE any conversation is created. The
 *   two IP-keyed scopes, which are checked before the business is known and
 *   so cannot flag a conversation.
 * - `soft`: the business is known, so the visitor gets a fixed, server-
 *   authored reply, the conversation is flagged for a human and no model
 *   call is made. `business_burst`, whose victim is the tenant, not the
 *   visitor.
 *
 * The pre-existing `ip` / `key` / `conversation` scopes are deliberately not
 * listed: they keep their plain 429 (decision recorded in STATE.md).
 */
export type AbuseScope = "business_burst" | "new_conversation_ip" | "ip_subnet";

export const ABUSE_SCOPE_TIER: Readonly<Record<AbuseScope, "hard" | "soft">> = {
  business_burst: "soft",
  new_conversation_ip: "hard",
  ip_subnet: "hard",
};

export type AbuseResponse = "proceed" | "reject_429" | "soft_reply";

/** What the route does for one abuse scope's verdict. */
export function resolveAbuseResponse(scope: AbuseScope, allowed: boolean): AbuseResponse {
  if (allowed) return "proceed";
  return ABUSE_SCOPE_TIER[scope] === "hard" ? "reject_429" : "soft_reply";
}

/** Fixed reply for the soft path. Server-authored, never model output. */
export const SOFT_LIMIT_MESSAGE =
  "We're receiving a lot of messages right now. A member of our team has been notified and will follow up with you shortly.";

/**
 * Stage E: the one client-side signal the widget loader reports, the time in
 * milliseconds between the loader script starting and this send. A person
 * cannot open the panel and send in under a second; a script driving the
 * widget or posting straight to the API can.
 *
 * - `too_fast`: a reported value under CLIENT_TOO_FAST_MS.
 * - `unreported`: no value. NEVER penalised -- every embed loaded before this
 *   shipped (and any cached loader) omits it, so absence proves nothing.
 * - `ok`: reported and plausible.
 *
 * The signal is client-supplied and trivially forged, so it can only ever
 * TIGHTEN a limit, never loosen one or grant anything.
 */
export const CLIENT_TOO_FAST_MS = 1000;
export type ClientSignal = "ok" | "too_fast" | "unreported";

export function classifyClientSignal(elapsedMs: number | null | undefined): ClientSignal {
  if (elapsedMs === null || elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return "unreported";
  return elapsedMs < CLIENT_TOO_FAST_MS ? "too_fast" : "ok";
}

/** A `too_fast` request is held to half the new-conversation limit; anything else keeps it. */
export function effectiveNewConversationLimit(signal: ClientSignal): number {
  const base = SCOPE_LIMITS.new_conversation_ip.limit;
  return signal === "too_fast" ? Math.ceil(base / 2) : base;
}

/**
 * Seconds until the current fixed rate-limit window closes, for the
 * `Retry-After` header on a 429 (RFC 9110 §10.2.3: a non-negative integer
 * number of seconds). Windows are aligned to the Unix epoch
 * (`floor(now / window) * window`, exactly as public.check_rate_limits and
 * increment_rate_limit_counter compute `window_start`), so this is exact, not
 * an estimate. Never returns less than 1, so a client never retries
 * immediately into the same window.
 */
export function secondsUntilWindowEnd(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  const remainingMs = windowMs - (nowMs % windowMs);
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
