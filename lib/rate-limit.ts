import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { resolveAbuseLimitVerdict } from "@/lib/abuse-limits";

export type RateLimitScope =
  | "ip"
  | "key"
  | "conversation"
  | "poll_ip"
  | "poll_conversation"
  | "restore_ip"
  | "recent_chats_ip"
  | "whatsapp_webhook"
  | "instagram_webhook"
  // Phase 32 abuse scopes (STATE.md). All three ship in log-only mode and
  // fail OPEN -- see lib/abuse-limits.ts (LOG_ONLY_SCOPES / FAIL_OPEN_SCOPES).
  | "business_burst"
  | "new_conversation_ip"
  | "ip_subnet"
  // Phase 33 (docs/phases.md): /apache platform-admin scopes. Both are
  // enforcing (not log-only/fail-open -- see lib/abuse-limits.ts), keyed on
  // the acting admin's Clerk user_id, not an IP or tenant.
  | "admin_mutation"
  | "admin_pii_reveal";

/**
 * Raw fixed-window increment: bumps the (scope, identifier) counter via
 * public.increment_rate_limit_counter() and returns the new count, or `null`
 * on an infrastructure error. Unlike checkAndIncrementRateLimit() it does NOT
 * compare against a limit, so the caller can choose the limit *after* the
 * increment has run.
 *
 * Used by app/api/chat/route.ts to increment the `business_burst` counter
 * concurrently with its other pre-AI reads inside the existing Promise.all,
 * then pick the trial-vs-normal ceiling from the entitlement the quota check
 * loaded in that same batch -- no extra query, no added latency (Phase 32,
 * STATE.md). Pair the returned count with resolveAbuseLimitVerdict().
 *
 * The raw identifier (ip/widgetKey/conversationId/business_id) is
 * deliberately never logged here -- same "never log a raw IP" precedent as
 * the ip-scope 429 logging (Phase 19b, docs/phase-19-audit-findings.md §6).
 */
export async function incrementRateLimitCounter(
  scope: RateLimitScope,
  identifier: string,
  windowSeconds: number,
): Promise<number | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await withTransportRetry(() =>
    supabase.rpc("increment_rate_limit_counter", {
      p_scope: scope,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
    }),
  );

  if (error) {
    logEvent("rate_limit_check_failed", "unknown", { scope, ...describeRpcError(error) }, "error");
    return null;
  }

  return data as number;
}

/**
 * Runs a counter RPC and, if it fails with a TRANSPORT error (`fetch failed`:
 * no response at all, no Postgres error code), tries it once more after a
 * short pause. The counter calls fail CLOSED for the enforcing scopes, so a
 * single dropped connection -- e.g. a stale keep-alive socket after a serverless
 * instance sat idle -- used to become a visitor-facing 429 with quota to spare.
 * Only transport errors are retried: a real database error, or any verdict
 * (including "over the limit"), is returned as-is, and no limit changes. The
 * worst case is that the first attempt reached the database and counted, so the
 * retry counts the same request twice -- one extra increment in a fixed window,
 * in the direction of stricter limiting, never looser.
 */
async function withTransportRetry<T extends { error: { code?: string; message?: string } | null }>(call: () => PromiseLike<T>): Promise<T> {
  const first = await call();
  if (first.error && !first.error.code && /fetch failed/i.test(first.error.message ?? "")) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return call();
  }
  return first;
}

/** The Postgres/PostgREST/network error behind a failed counter call -- code and a truncated message only, never the request (which carries the IP or key). Added 2026-10-28 because the failure was being swallowed with no cause. */
function describeRpcError(error: { code?: string; message?: string } | null): { errorCode: string; errorMessage: string } {
  return { errorCode: error?.code ?? "none", errorMessage: (error?.message ?? "no data returned").slice(0, 200) };
}

export type BatchedRateLimitCheck = {
  scope: RateLimitScope;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export type BatchedRateLimitResult = {
  /** The real verdict after log-only / fail-open resolution (abuse scopes). */
  allowed: boolean;
  /** True when a log-only scope is over its limit (request still allowed). */
  wouldExceed: boolean;
  /** The new counter value, or null on an infrastructure error. */
  requestCount: number | null;
  /** Seconds until the current window closes, or null on error. */
  retryAfterSeconds: number | null;
};

/**
 * Stage B (STATE.md): runs several fixed-window counter checks in ONE round
 * trip via public.check_rate_limits(), instead of one RPC per scope. Returns
 * a map keyed by scope, so each entry must use a DISTINCT scope.
 *
 * The SQL function returns a naive `allowed` (count <= limit); this wrapper
 * discards it and re-derives the real verdict through resolveAbuseLimitVerdict
 * from the returned count, so the log-only / fail-open rules stay in one place
 * (lib/abuse-limits.ts). On a whole-call infrastructure error every scope
 * resolves from a null count -- fail OPEN for the abuse scopes, fail CLOSED
 * for the pre-existing ones -- exactly like a single-call error.
 */
export async function checkRateLimitsBatch(
  checks: BatchedRateLimitCheck[],
  businessId: string = "unknown",
): Promise<Map<RateLimitScope, BatchedRateLimitResult>> {
  const results = new Map<RateLimitScope, BatchedRateLimitResult>();
  if (checks.length === 0) return results;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await withTransportRetry(() =>
    supabase.rpc("check_rate_limits", {
      p_checks: checks.map((c) => ({
        scope: c.scope,
        identifier: c.identifier,
        limit: c.limit,
        window_seconds: c.windowSeconds,
      })),
    }),
  );

  if (error || !data) {
    logEvent("rate_limit_check_failed", businessId, { scope: "batch", ...describeRpcError(error) }, "error");
    for (const c of checks) {
      const verdict = resolveAbuseLimitVerdict(c.scope, null, c.limit);
      results.set(c.scope, { allowed: verdict.allowed, wouldExceed: false, requestCount: null, retryAfterSeconds: null });
    }
    return results;
  }

  const rows = data as Array<{ scope: string; request_count: number; retry_after_seconds: number }>;
  const byScope = new Map(rows.map((row) => [row.scope, row]));

  for (const c of checks) {
    const row = byScope.get(c.scope);
    const count = row ? row.request_count : null;
    const verdict = resolveAbuseLimitVerdict(c.scope, count, c.limit);
    if (verdict.wouldExceed) {
      logEvent("rate_limit_would_exceed", businessId, { scope: c.scope, requestCount: count ?? -1, limit: c.limit });
    }
    results.set(c.scope, {
      allowed: verdict.allowed,
      wouldExceed: verdict.wouldExceed,
      requestCount: count,
      retryAfterSeconds: row ? row.retry_after_seconds : null,
    });
  }
  return results;
}

/**
 * Atomically increments the fixed-window counter for (scope, identifier) and
 * returns whether this request is still within `limit`. Always increments,
 * even when the result is over the limit -- a retry can't reset the count for
 * the current window. See docs/security.md §4 (rate limiting per key/IP/
 * conversation) and STATE.md §4's resolved D4.
 *
 * Behaviour per scope is centralised in resolveAbuseLimitVerdict()
 * (lib/abuse-limits.ts):
 *  - The pre-existing scopes (ip / key / conversation / poll / restore /
 *    recent-chats / the two webhook scopes) are unchanged: fail CLOSED on an
 *    infrastructure error, `count <= limit` otherwise.
 *  - The Phase 32 abuse scopes fail OPEN on error and, while in log-only
 *    mode, only RECORD a trip (`rate_limit_would_exceed`, default level so a
 *    flood does not page Sentry) while still allowing the request.
 *
 * `businessId` is optional and used only for the would-exceed log line (the
 * business_burst identifier is the business id); it defaults to "unknown" so
 * existing call sites are unchanged.
 */
export async function checkAndIncrementRateLimit(
  scope: RateLimitScope,
  identifier: string,
  limit: number,
  windowSeconds: number,
  businessId: string = "unknown",
): Promise<boolean> {
  const count = await incrementRateLimitCounter(scope, identifier, windowSeconds);
  const verdict = resolveAbuseLimitVerdict(scope, count, limit);

  if (verdict.wouldExceed) {
    // Log-only observation window (Phase 32, decision 2): the bucket is over,
    // but this scope does not block yet. Default (non-error) level on
    // purpose -- a flood must not page Sentry while we are only measuring.
    logEvent("rate_limit_would_exceed", businessId, { scope, requestCount: count ?? -1, limit });
  }

  return verdict.allowed;
}
