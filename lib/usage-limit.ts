import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import { getEntitlement, type Entitlement } from "@/lib/subscription";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * The per-business AI usage quota.
 *
 * Phase 17a rewrote this module. Until 2026-10-21 it summed
 * `input_tokens + output_tokens` from `ai_response_metrics` for the UTC
 * calendar month and compared the total against one global
 * `AI_MONTHLY_TOKEN_LIMIT` env var (default 2,000,000) applied identically
 * to every tenant. Two things were wrong with that, and both were
 * published promises the code could not keep:
 *
 * 1. **It had no notion of a plan.** /pricing sells three different
 *    quotas; the code enforced one number for everyone.
 * 2. **It counted the wrong unit.** The page sells AI *replies*; the code
 *    counted *tokens*, so the advertised figure and the enforced figure
 *    could not even be compared. A verbose turn cost a business several
 *    times what a terse one did, against a limit expressed in neither.
 *
 * It now counts **AI replies against the business's plan quota for its
 * current billing period** (lib/subscription.ts), which is exactly what
 * the page advertises. One `ai_response_metrics` row is one real AI turn
 * (see that table's own migration comment), so the count is a COUNT, not
 * a sum.
 *
 * `AI_MONTHLY_TOKEN_LIMIT` is gone: a tunable that no longer tunes
 * anything is worse than no tunable, and leaving it in `lib/env.ts` would
 * have implied an operator could still change a customer's quota with it.
 */

/**
 * WHAT THE COUNT INCLUDES, verified against production 2026-10-21 rather
 * than assumed. Both of these are deliberate, and both are recorded here
 * because they are the two ways this number differs from a naive reading
 * of "every answer the AI gave".
 *
 * **(a) A cached reply is NOT counted.** lib/rag.ts's first-turn response
 * cache (Phase 23) returns before any Gemini call and before the
 * `ai_response_metrics` insert, so a cache hit writes no row and does not
 * consume quota. Accepted, for three reasons: a cache hit costs this app
 * no Gemini call at all, so charging for it would be charging for nothing;
 * the error is always in the customer's favour, which is the right
 * direction for a quota to be wrong in; and the quota check runs *before*
 * the cache read, so an out-of-quota business does not get cached replies
 * either -- the stop is still strict. The pricing page's own wording ("one
 * answer your AI employee generates") survives this reading.
 *
 * **(b) Eval and latency-harness traffic IS counted.** `npm run eval` and
 * the latency harness post to the real `/api/chat` with Acme Test Co.'s
 * real widget key, so their conversations are `source = 'chat_widget'` and
 * write ordinary metrics rows: Acme carried 52 such rows in the 30 days to
 * 2026-10-21, every one of them synthetic. Acme's own quota therefore
 * includes this project's test traffic. Left as-is on purpose: filtering
 * by conversation source would make the quota depend on a field the chat
 * route sets, and a "don't count this turn" switch on a metered path is
 * exactly the kind of thing that gets reused wrongly later. Acme is a test
 * tenant on the grandfathered 10,000-reply default, so 52 synthetic
 * replies a month is immaterial; if an eval run ever needs to not count,
 * give the harness its own business rather than teaching this counter to
 * ignore rows.
 *
 * Dashboard sandbox turns (`source = 'dashboard_test'`) are already
 * excluded, and not by anything here: the sandbox runs under the
 * authenticated client, which has no INSERT grant on
 * `ai_response_metrics`, so its best-effort metrics write silently fails
 * and no row exists to count. Confirmed: 0 metrics rows attached to any
 * `dashboard_test` conversation in production. That matches what /pricing
 * promises ("neither do messages you send yourself while testing in the
 * sandbox").
 */
export type ReplyQuotaStatus = {
  /** False means the AI must not reply: quota reached, or not serving at all. */
  allowed: boolean;
  /** AI replies already used in this billing period, before the current turn. */
  repliesUsed: number;
  replyQuota: number;
  entitlement: Entitlement;
  /**
   * True when the count could not be read and the turn was allowed through
   * anyway. Nothing should draw a percentage or send a reminder from a
   * degraded status -- the number in it is not a measurement.
   */
  degraded: boolean;
};

/**
 * Counts this period's AI replies and compares them against the plan's
 * quota. Called at the very top of `askSalesEmployee()`, before any Gemini
 * call (including the embedding call retrieval itself makes) -- a business
 * over quota must not spend another token, not merely stop short of a full
 * response.
 *
 * **Fails open on a read error, unchanged from Phase 22h**: a metrics-read
 * failure must never itself take down a customer's live widget. The error
 * is logged at "error" level so Sentry sees it (lib/logger.ts), which the
 * old implementation did not do -- it used a bare `console.error`, so a
 * quota check silently failing for a whole month would never have alerted.
 */
export async function checkReplyQuota(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ReplyQuotaStatus> {
  const entitlement = await getEntitlement(supabase, businessId);

  const { count, error } = await supabase
    .from("ai_response_metrics")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", entitlement.periodStart);

  if (error || count === null) {
    logEvent("usage_quota_check_failed", businessId, { planKey: entitlement.planKey }, "error");
    return {
      // Still honours a hard stop (an expired trial or a lapsed grace
      // period), because that verdict came from the subscription row and
      // not from the count that just failed.
      allowed: entitlement.serving,
      repliesUsed: 0,
      replyQuota: entitlement.replyQuota,
      entitlement,
      degraded: true,
    };
  }

  return {
    allowed: entitlement.serving && count < entitlement.replyQuota,
    repliesUsed: count,
    replyQuota: entitlement.replyQuota,
    entitlement,
    degraded: false,
  };
}

/**
 * Boolean-only form, for the callers that just need "may this business
 * spend a Gemini call right now" and have no use for the counts:
 * lib/copilot.ts's daily brief and lib/workflow-engine.ts's AI actions.
 */
export async function isWithinUsageQuota(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const status = await checkReplyQuota(supabase, businessId);
  return status.allowed;
}
