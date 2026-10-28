import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { estimateCallCostUsd, USD_TO_INR_RATE } from "@/lib/gemini-pricing";
import { monthlyValuePaise } from "@/lib/admin-billing-shared";
import { PLANS, type PlanKey } from "@/lib/plans";

/**
 * Phase 33 Stop 3 (docs/phases.md): the /apache AI Usage & Costs page.
 * Built entirely on `gemini_api_calls` (the token-burn audit's existing
 * log) and `subscriptions` -- no new usage table. `environment !==
 * 'production'` rows are always excluded, same as lib/admin-metrics.ts's
 * Overview tile, so local/dev/CI noise never pollutes a real cost figure.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function windowStartIso(days: number): string {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const start = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() - days);
  return new Date(start - IST_OFFSET_MS).toISOString();
}

export type PlatformAiHealth = {
  totalCalls: number;
  successRatePercent: number | null;
  avgDurationMs: number | null;
  errorRatePercent: number | null;
};

export async function getPlatformAiHealth(windowDays: number): Promise<PlatformAiHealth> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("gemini_api_calls")
    .select("success, duration_ms")
    .eq("environment", "production")
    .gte("created_at", windowStartIso(windowDays));

  if (error || !data || data.length === 0) {
    return { totalCalls: 0, successRatePercent: null, avgDurationMs: null, errorRatePercent: null };
  }

  const totalCalls = data.length;
  const successCount = data.filter((r) => r.success).length;
  const avgDurationMs = data.reduce((sum, r) => sum + r.duration_ms, 0) / totalCalls;

  return {
    totalCalls,
    successRatePercent: (successCount / totalCalls) * 100,
    avgDurationMs,
    errorRatePercent: ((totalCalls - successCount) / totalCalls) * 100,
  };
}

export type TenantCostMargin = {
  businessId: string;
  businessName: string;
  planKey: PlanKey;
  planName: string;
  costUsd: number;
  revenuePaise: number;
  /** Cost as a percent of what this tenant pays, in the window -- null if the tenant has no subscription row (grandfathered, no plan price to compare against). */
  costPercentOfRevenue: number | null;
  /** True once costPercentOfRevenue crosses the flag threshold (approved brief: "flag tenants whose cost exceeds X% of what they pay"). */
  flagged: boolean;
};

const COST_FLAG_THRESHOLD_PERCENT = 20;

export async function getPerTenantCostMargin(windowDays: number): Promise<TenantCostMargin[]> {
  const supabase = createAdminSupabaseClient();

  const [callsResult, subscriptionsResult, businessesResult] = await Promise.all([
    supabase
      .from("gemini_api_calls")
      .select("business_id, model, prompt_tokens, candidates_tokens, created_at")
      .eq("environment", "production")
      .not("business_id", "is", null)
      .gte("created_at", windowStartIso(windowDays)),
    supabase.from("subscriptions").select("business_id, plan_key, current_period_start, current_period_end"),
    supabase.from("businesses").select("id, name"),
  ]);

  const businessNameById = new Map((businessesResult.data ?? []).map((b) => [b.id, b.name]));
  const subscriptionByBusinessId = new Map(
    (subscriptionsResult.data ?? []).map((s) => [
      s.business_id,
      { planKey: s.plan_key as PlanKey, periodStart: s.current_period_start, periodEnd: s.current_period_end },
    ]),
  );

  const costByBusinessId = new Map<string, number>();
  for (const row of callsResult.data ?? []) {
    const cost = estimateCallCostUsd(row.model, row.prompt_tokens, row.candidates_tokens, row.created_at);
    if (cost === null || !row.business_id) continue;
    costByBusinessId.set(row.business_id, (costByBusinessId.get(row.business_id) ?? 0) + cost);
  }

  const rows: TenantCostMargin[] = [];
  for (const [businessId, costUsd] of costByBusinessId) {
    const sub = subscriptionByBusinessId.get(businessId);
    const planKey = sub?.planKey ?? "scale"; // grandfathered default (lib/subscription.ts's GRANDFATHERED_PLAN_KEY)
    const revenuePaise = sub ? monthlyValuePaise(planKey, sub.periodStart, sub.periodEnd) : PLANS[planKey].monthlyPricePaise;
    const revenueUsd = (revenuePaise / 100) / USD_TO_INR_RATE;
    const costPercentOfRevenue = revenueUsd > 0 ? (costUsd / revenueUsd) * 100 : null;

    rows.push({
      businessId,
      businessName: businessNameById.get(businessId) ?? "Unknown",
      planKey,
      planName: PLANS[planKey].name,
      costUsd,
      revenuePaise,
      costPercentOfRevenue,
      flagged: costPercentOfRevenue !== null && costPercentOfRevenue > COST_FLAG_THRESHOLD_PERCENT,
    });
  }

  return rows.sort((a, b) => b.costUsd - a.costUsd);
}

export { COST_FLAG_THRESHOLD_PERCENT };
