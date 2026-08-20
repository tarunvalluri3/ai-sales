import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Default monthly per-business token budget (Phase 22h, STATE.md /
 * docs/phases.md), used when AI_MONTHLY_TOKEN_LIMIT is unset. Deliberately
 * a token quota, not a tracked dollar figure -- Gemini's per-token
 * pricing varies by model and changes over time, and hardcoding a price
 * table here would go stale and mislead. The phase brief's own wording
 * ("usage quota/spend limit") explicitly allows either framing; a token
 * quota is the honest one, since lib/rag.ts already measures tokens
 * exactly (never estimated) via ai_response_metrics (Phase 21).
 */
const DEFAULT_MONTHLY_TOKEN_LIMIT = 2_000_000;

function getMonthlyTokenLimit(): number {
  const raw = process.env.AI_MONTHLY_TOKEN_LIMIT;
  if (!raw) return DEFAULT_MONTHLY_TOKEN_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_TOKEN_LIMIT;
}

function startOfCurrentUtcMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Whether `businessId` is still within its current-calendar-month token
 * budget, summed from `ai_response_metrics` (Phase 21's exact,
 * never-estimated per-turn token counts). Called at the very top of
 * `askSalesEmployee()`, before any Gemini call (including the embedding
 * call retrieval itself makes) -- a business over quota must not spend
 * another token, not just stop short of a full response. Fails open
 * (returns true, "allowed") on a query error: a metrics-read failure
 * must never itself take down the chat widget, matching every other
 * best-effort read/write in this codebase's public chat path.
 */
export async function isWithinUsageQuota(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_response_metrics")
    .select("input_tokens, output_tokens")
    .eq("business_id", businessId)
    .gte("created_at", startOfCurrentUtcMonth());

  if (error) {
    console.error(
      JSON.stringify({
        event: "usage_quota_check_failed",
        businessId,
        timestamp: new Date().toISOString(),
      }),
    );
    return true;
  }

  const totalTokens = data.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);
  return totalTokens < getMonthlyTokenLimit();
}
