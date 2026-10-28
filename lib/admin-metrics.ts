import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import type { PlanKey } from "@/lib/plans";
import { estimateCallCostUsd, USD_TO_INR_RATE } from "@/lib/gemini-pricing";
import { monthlyValuePaise } from "@/lib/admin-billing-shared";

/**
 * Phase 33 (docs/phases.md): platform-wide metrics for the /apache
 * Overview page. Deliberately separate from lib/analytics.ts, which only
 * ever computes ONE tenant's own numbers from an authenticated Clerk
 * session -- these queries run cross-tenant through the admin service-role
 * client (lib/supabase/admin.ts) and must only ever be called from code
 * already behind requirePlatformAdmin().
 *
 * Every query excludes sandbox conversations with the same filter
 * lib/analytics.ts uses, for the same reason: a tenant's own test
 * conversations must not inflate a platform-wide KPI either.
 */

const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The UTC instant of IST midnight, `daysAgo` IST calendar days before today. */
function istMidnightUtc(daysAgo: number): Date {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const istMidnight = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate() - daysAgo);
  return new Date(istMidnight - IST_OFFSET_MS);
}

function istMonthStartUtc(): Date {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const istMonthStart = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1);
  return new Date(istMonthStart - IST_OFFSET_MS);
}

/** Percent change from `previous` to `current`, or `null` when `previous` is 0 (division is meaningless, not "infinite growth"). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export type KpiValue = {
  current: number;
  previous: number;
  percentChange: number | null;
};

async function countInWindow(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  startIso: string,
  endIso: string,
  excludeSandbox = false,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (excludeSandbox) query = query.or(EXCLUDE_SANDBOX_FILTER);
  const { count, error } = await query;
  if (error) {
    console.error(JSON.stringify({ event: "admin_metrics_query_failed", table, timestamp: new Date().toISOString() }));
    return 0;
  }
  return count ?? 0;
}

/** Builds a two-window (current vs. previous, equal length) KPI from a simple created_at count. */
async function windowedKpi(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  windowDays: number,
  excludeSandbox = false,
): Promise<KpiValue> {
  const nowIso = new Date().toISOString();
  const windowStartIso = istMidnightUtc(windowDays).toISOString();
  const prevWindowStartIso = istMidnightUtc(windowDays * 2).toISOString();

  const [current, previous] = await Promise.all([
    countInWindow(supabase, table, windowStartIso, nowIso, excludeSandbox),
    countInWindow(supabase, table, prevWindowStartIso, windowStartIso, excludeSandbox),
  ]);

  return { current, previous, percentChange: percentChange(current, previous) };
}

/** Today (IST) vs. yesterday (IST), for the four daily tiles. */
async function dailyKpi(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  excludeSandbox = false,
): Promise<KpiValue> {
  const todayStart = istMidnightUtc(0).toISOString();
  const yesterdayStart = istMidnightUtc(1).toISOString();
  const nowIso = new Date().toISOString();

  const [current, previous] = await Promise.all([
    countInWindow(supabase, table, todayStart, nowIso, excludeSandbox),
    countInWindow(supabase, table, yesterdayStart, todayStart, excludeSandbox),
  ]);

  return { current, previous, percentChange: percentChange(current, previous) };
}

export type RevenueMetrics = {
  mrrPaise: number;
  arrPaise: number;
  payingTenantCount: number;
  /** Cancelled or expired within the trailing 30 days, divided by paying tenants 30 days ago -- an approximation (see inline comment), not a cohort-based churn calculation. */
  churnRatePercent: number | null;
};

async function getRevenueMetrics(supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<RevenueMetrics> {
  const { data: paidRows, error: paidError } = await supabase
    .from("subscriptions")
    .select("plan_key, current_period_start, current_period_end")
    .in("status", ["active", "past_due"]);

  if (paidError) {
    console.error(JSON.stringify({ event: "admin_metrics_revenue_query_failed", timestamp: new Date().toISOString() }));
    return { mrrPaise: 0, arrPaise: 0, payingTenantCount: 0, churnRatePercent: null };
  }

  const rows = (paidRows ?? []) as Array<{ plan_key: PlanKey; current_period_start: string | null; current_period_end: string | null }>;
  const mrrPaise = rows.reduce((sum, row) => sum + monthlyValuePaise(row.plan_key, row.current_period_start, row.current_period_end), 0);

  const thirtyDaysAgoIso = istMidnightUtc(30).toISOString();
  const { count: churnedCount, error: churnError } = await supabase
    .from("subscriptions")
    .select("business_id", { count: "exact", head: true })
    .in("status", ["cancelled", "expired"])
    .gte("updated_at", thirtyDaysAgoIso);

  const churnRatePercent =
    !churnError && rows.length > 0 && churnedCount !== null
      ? (churnedCount / (rows.length + churnedCount)) * 100
      : null;

  return {
    mrrPaise,
    arrPaise: mrrPaise * 12,
    payingTenantCount: rows.length,
    churnRatePercent,
  };
}

export type GeminiCostMetrics = {
  todayUsd: number;
  monthToDateUsd: number;
  unpricedCallsToday: number;
};

async function getGeminiCostMetrics(supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<GeminiCostMetrics> {
  const monthStartIso = istMonthStartUtc().toISOString();

  const { data, error } = await supabase
    .from("gemini_api_calls")
    .select("model, prompt_tokens, candidates_tokens, created_at")
    .eq("environment", "production")
    .gte("created_at", monthStartIso);

  if (error || !data) {
    console.error(JSON.stringify({ event: "admin_metrics_gemini_cost_query_failed", timestamp: new Date().toISOString() }));
    return { todayUsd: 0, monthToDateUsd: 0, unpricedCallsToday: 0 };
  }

  const todayStartIso = istMidnightUtc(0).toISOString();
  let todayUsd = 0;
  let monthToDateUsd = 0;
  let unpricedCallsToday = 0;

  for (const row of data as Array<{ model: string; prompt_tokens: number | null; candidates_tokens: number | null; created_at: string }>) {
    const cost = estimateCallCostUsd(row.model, row.prompt_tokens, row.candidates_tokens, row.created_at);
    const isToday = row.created_at >= todayStartIso;
    if (cost === null) {
      if (isToday) unpricedCallsToday += 1;
      continue;
    }
    monthToDateUsd += cost;
    if (isToday) todayUsd += cost;
  }

  return { todayUsd, monthToDateUsd, unpricedCallsToday };
}

export type OverviewMetrics = {
  totalTenants: number;
  newSignups7d: KpiValue;
  activeTenants7d: KpiValue;
  trialsExpiringThisWeek: number;
  revenue: RevenueMetrics;
  conversationsToday: KpiValue;
  leadsToday: KpiValue;
  appointmentsBookedToday: KpiValue;
  geminiCost: GeminiCostMetrics;
  usdToInrRate: number;
};

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const supabase = createAdminSupabaseClient();

  const [
    totalTenantsResult,
    newSignups7d,
    activeTenants7dResult,
    trialsExpiringResult,
    revenue,
    conversationsToday,
    leadsToday,
    appointmentsBookedToday,
    geminiCost,
  ] = await Promise.all([
    supabase.from("businesses").select("id", { count: "exact", head: true }),
    windowedKpi(supabase, "businesses", 7),
    getActiveTenants7d(supabase),
    supabase
      .from("subscriptions")
      .select("business_id", { count: "exact", head: true })
      .eq("status", "trialing")
      .gte("trial_ends_at", new Date().toISOString())
      .lte("trial_ends_at", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    getRevenueMetrics(supabase),
    dailyKpi(supabase, "conversations", true),
    dailyKpi(supabase, "leads"),
    dailyKpi(supabase, "appointments"),
    getGeminiCostMetrics(supabase),
  ]);

  return {
    totalTenants: totalTenantsResult.count ?? 0,
    newSignups7d,
    activeTenants7d: activeTenants7dResult,
    trialsExpiringThisWeek: trialsExpiringResult.count ?? 0,
    revenue,
    conversationsToday,
    leadsToday,
    appointmentsBookedToday,
    geminiCost,
    usdToInrRate: USD_TO_INR_RATE,
  };
}

/**
 * Distinct businesses with at least one non-sandbox conversation in the
 * window -- "active" means "had real usage", not "exists". Counted via a
 * JS Set over `business_id` because PostgREST has no server-side
 * COUNT(DISTINCT col); acceptable here since this reads only one narrow
 * column over a bounded 7/14-day window, not the whole table.
 */
async function getActiveTenants7d(supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<KpiValue> {
  const nowIso = new Date().toISOString();
  const windowStartIso = istMidnightUtc(7).toISOString();
  const prevWindowStartIso = istMidnightUtc(14).toISOString();

  const [currentRows, previousRows] = await Promise.all([
    supabase.from("conversations").select("business_id").gte("created_at", windowStartIso).lt("created_at", nowIso).or(EXCLUDE_SANDBOX_FILTER),
    supabase.from("conversations").select("business_id").gte("created_at", prevWindowStartIso).lt("created_at", windowStartIso).or(EXCLUDE_SANDBOX_FILTER),
  ]);

  const current = new Set((currentRows.data ?? []).map((r) => r.business_id)).size;
  const previous = new Set((previousRows.data ?? []).map((r) => r.business_id)).size;

  return { current, previous, percentChange: percentChange(current, previous) };
}

export { USD_TO_INR_RATE };
