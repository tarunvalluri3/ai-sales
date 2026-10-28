import { PLANS, type PlanKey } from "@/lib/plans";

/**
 * Normalizes one subscription row to its monthly INR value, in paise.
 * Shared by lib/admin-metrics.ts (Overview MRR/ARR) and lib/admin-billing.ts
 * (Subscriptions & Billing rollup) -- was duplicated between the two until
 * Stop 2, extracted here instead.
 *
 * There is no `billing_interval` column on `subscriptions`
 * (20261024000000) -- monthly vs. annual is inferred from the current
 * period's length, since Razorpay (not this app) owns period boundaries.
 * A period longer than 60 days is treated as annual and divided by 12;
 * anything shorter (or a trialing/no-period row) is treated as monthly.
 * This is a documented approximation, not a stored fact, flagged here
 * rather than silently treated as exact so a future billing_interval
 * column can replace it outright.
 *
 * Deliberately NOT "server-only" -- pure function, no I/O, importable by
 * a plain Node test script the same way lib/plans.ts already is.
 */
export function monthlyValuePaise(planKey: PlanKey, periodStartIso: string | null, periodEndIso: string | null): number {
  const plan = PLANS[planKey];
  if (!periodStartIso || !periodEndIso) return plan.monthlyPricePaise;
  const periodDays = (new Date(periodEndIso).getTime() - new Date(periodStartIso).getTime()) / (24 * 60 * 60 * 1000);
  return periodDays > 60 ? Math.round(plan.annualPricePaise / 12) : plan.monthlyPricePaise;
}
