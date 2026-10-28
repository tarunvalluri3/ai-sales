import "server-only";
import { ORDERED_PLANS, TRIAL_DAYS, TRIAL_REPLY_QUOTA, PAST_DUE_GRACE_DAYS } from "@/lib/plans";
import { GEMINI_PRICING } from "@/lib/gemini-pricing";

/**
 * Phase 33 Stop 5 (docs/phases.md), approved brief: Settings should show
 * "default plan limits, trial length, pricing config". This is a
 * deliberately READ-ONLY display, sourced from the SAME single-source
 * files every other page already uses (lib/plans.ts, lib/gemini-pricing.ts)
 * -- not duplicated into a new editable table.
 *
 * NOT made DB-editable in this stop, by explicit scope decision (recorded
 * in STATE.md, not silently dropped): lib/plans.ts's own header describes
 * its rigidity as deliberate ("one number per plan... a typecheck failure
 * rather than a silent mis-sale"), and TRIAL_DAYS is pinned together with
 * a database trigger (create_trial_subscription_for_new_business(),
 * 20261025000000) that a pgTAP test (049) asserts produces exactly a
 * 14-day interval. Making either one dynamically admin-editable would
 * mean either rewiring the billing/entitlement code this phase was told
 * not to touch, or giving a SECURITY DEFINER trigger a new RLS-exempt read
 * path -- both bigger, riskier changes than this stop's approved scope.
 * Changing a real number still requires a code change and a new PR, same
 * as today.
 */

export function getPlatformSettingsSnapshot() {
  return {
    trialDays: TRIAL_DAYS,
    trialReplyQuota: TRIAL_REPLY_QUOTA,
    pastDueGraceDays: PAST_DUE_GRACE_DAYS,
    plans: ORDERED_PLANS.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyPricePaise: plan.monthlyPricePaise,
      annualPricePaise: plan.annualPricePaise,
      monthlyReplyQuota: plan.monthlyReplyQuota,
      channels: plan.channels,
    })),
    geminiPricing: GEMINI_PRICING,
  };
}
