import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PLANS, type PlanKey } from "@/lib/plans";
import type { SubscriptionStatus } from "@/lib/subscription";
import { monthlyValuePaise } from "@/lib/admin-billing-shared";

/**
 * Phase 33 Stop 2 (docs/phases.md): platform-wide billing rollups for
 * /apache/billing. Read-only -- the only billing MUTATIONS this phase
 * ships are per-tenant plan override (tenant detail page, owner-only,
 * lib/admin-tenant-actions.ts) and usage-limit override. Credit notes are
 * deliberately NOT wired to a button here: issuing one calls Razorpay's
 * real refund API, and `scripts/issue-credit-note.mjs`'s own header notes
 * its execute path "has never been run against real Razorpay/Postgres" --
 * building an admin-UI trigger for an untested real-money path is a
 * bigger risk than this stop should take on without the user explicitly
 * asking for it. The existing dry-run-by-default CLI script remains the
 * supported path; this page links to it.
 */

export type BillingRollup = {
  mrrPaise: number;
  arrPaise: number;
  payingTenantCount: number;
  arpuPaise: number;
  byPlan: Record<PlanKey, number>;
  byStatus: Record<SubscriptionStatus, number>;
};

export type SubscriptionRow = {
  businessId: string;
  businessName: string;
  planKey: PlanKey;
  planName: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

export async function getBillingRollup(): Promise<BillingRollup> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_key, status, current_period_start, current_period_end")
    .in("status", ["active", "past_due"]);

  const byPlan: Record<PlanKey, number> = { starter: 0, growth: 0, scale: 0 };
  const byStatus: Record<SubscriptionStatus, number> = { trialing: 0, active: 0, past_due: 0, cancelled: 0, expired: 0 };

  if (error || !data) {
    return { mrrPaise: 0, arrPaise: 0, payingTenantCount: 0, arpuPaise: 0, byPlan, byStatus };
  }

  let mrrPaise = 0;
  for (const row of data) {
    const planKey = row.plan_key as PlanKey;
    mrrPaise += monthlyValuePaise(planKey, row.current_period_start, row.current_period_end);
    byPlan[planKey] += 1;
  }

  const { data: statusCounts } = await supabase.from("subscriptions").select("status");
  for (const row of statusCounts ?? []) {
    const status = row.status as SubscriptionStatus;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    mrrPaise,
    arrPaise: mrrPaise * 12,
    payingTenantCount: data.length,
    arpuPaise: data.length > 0 ? Math.round(mrrPaise / data.length) : 0,
    byPlan,
    byStatus,
  };
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("business_id, plan_key, status, current_period_end, trial_ends_at, cancel_at_period_end, businesses(name)")
    .order("current_period_end", { ascending: true, nullsFirst: false });

  if (error || !data) return [];

  return (data as unknown as Array<{
    business_id: string;
    plan_key: PlanKey;
    status: SubscriptionStatus;
    current_period_end: string | null;
    trial_ends_at: string | null;
    cancel_at_period_end: boolean;
    businesses: { name: string } | null;
  }>).map((row) => ({
    businessId: row.business_id,
    businessName: row.businesses?.name ?? "Unknown",
    planKey: row.plan_key,
    planName: PLANS[row.plan_key].name,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }));
}
