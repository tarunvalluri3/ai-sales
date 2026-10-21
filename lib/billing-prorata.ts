import { PLANS, type PlanKey } from "@/lib/plans";

/**
 * The pro-rated amount charged when a customer upgrades mid-period.
 * Phase 17b (STATE.md).
 *
 * This exists because /pricing already promises it, in those words: *"You
 * can upgrade at any time and we charge only the difference for the rest
 * of your period; downgrades take effect at your next renewal."* The same
 * promise is in the 100%-of-quota upgrade email (lib/usage-reminders.ts).
 * So the pro-rata is not a design choice this phase made -- it is a
 * published commitment this phase had to make true.
 *
 * **The result is itself a GST-INCLUSIVE gross**, because both inputs are
 * (every price in lib/plans.ts is). That matters for Phase 17c: the
 * pro-rata charge goes through `gstBreakdown()` exactly like a plan price,
 * with no second tax rule and no "add GST to the difference" step. A
 * mid-period upgrade's invoice is an ordinary invoice for a smaller gross.
 *
 * **No `server-only`, no I/O**: pure integer arithmetic over the registry,
 * so plain Node can unit-test it (scripts/run-prorata-tests.mjs), the same
 * arrangement lib/plans.ts's GST helpers have.
 */

export type BillingInterval = "monthly" | "annual";

function grossFor(planKey: PlanKey, interval: BillingInterval): number {
  const plan = PLANS[planKey];
  return interval === "annual" ? plan.annualPricePaise : plan.monthlyPricePaise;
}

/**
 * True when moving from `from` to `to` is an upgrade, judged by **price,
 * not by position in the list**.
 *
 * Price is the honest test: the customer is being asked for more money or
 * less, and that is what decides whether the change can take effect
 * immediately (they have paid for it) or has to wait for the period
 * boundary (they have not). If the plan order and the price order ever
 * disagreed, the price is the one that must win.
 */
export function isUpgrade(from: PlanKey, to: PlanKey, interval: BillingInterval): boolean {
  return grossFor(to, interval) > grossFor(from, interval);
}

export type ProRataQuote = {
  readonly fromPlanKey: PlanKey;
  readonly toPlanKey: PlanKey;
  readonly interval: BillingInterval;
  /** GST-inclusive gross of the full-period difference, in paise. */
  readonly fullDifferencePaise: number;
  /** GST-inclusive gross actually charged now, in paise. */
  readonly amountPaise: number;
  /** Whole days left in the period, for the confirmation copy. */
  readonly remainingDays: number;
  readonly totalDays: number;
};

/**
 * What to charge now for an upgrade that takes effect immediately.
 *
 * `amount = round(fullDifference * remaining / total)` on the period's own
 * clock, in integer paise.
 *
 * The deliberate decisions, because each one is a decision about somebody's
 * money:
 *
 * - **Pro-rated on elapsed time, not on replies used.** A customer who
 *   upgrades on day 20 of 30 pays a third of the difference even if they
 *   have already used their whole Starter quota. Charging by consumption
 *   would be defensible but it is not what the page says, and the page is
 *   the contract.
 * - **Rounded half-up to the paisa, and clamped to the full difference.**
 *   Floating-point milliseconds cannot produce a charge larger than a full
 *   period's difference, and a clamp costs nothing to guarantee it.
 * - **A period already over, or a non-upgrade, quotes zero.** Zero is a
 *   real answer here and the caller checks for it: no order is created,
 *   the plan simply moves. It is never an error, because "upgrade on the
 *   last hour of the period" is a thing customers do.
 * - **The remaining-days figure is for copy only.** It is `ceil`ed so a
 *   customer with eleven and a half days left is told "12 days", never
 *   "11" -- the charge itself uses the exact millisecond ratio, not this
 *   rounded day count, so the number shown and the number charged cannot
 *   drift apart by a day's worth of money.
 */
export function proRataUpgradeQuote(params: {
  fromPlanKey: PlanKey;
  toPlanKey: PlanKey;
  interval: BillingInterval;
  periodStartIso: string;
  periodEndIso: string;
  now: Date;
}): ProRataQuote {
  const { fromPlanKey, toPlanKey, interval, periodStartIso, periodEndIso, now } = params;

  const fullDifferencePaise = Math.max(
    grossFor(toPlanKey, interval) - grossFor(fromPlanKey, interval),
    0,
  );

  const startMs = new Date(periodStartIso).getTime();
  const endMs = new Date(periodEndIso).getTime();
  const nowMs = now.getTime();

  const totalMs = endMs - startMs;
  const remainingMs = Math.min(Math.max(endMs - nowMs, 0), Math.max(totalMs, 0));

  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = totalMs > 0 ? Math.round(totalMs / dayMs) : 0;
  const remainingDays = remainingMs > 0 ? Math.ceil(remainingMs / dayMs) : 0;

  if (fullDifferencePaise === 0 || totalMs <= 0 || remainingMs <= 0) {
    return {
      fromPlanKey,
      toPlanKey,
      interval,
      fullDifferencePaise,
      amountPaise: 0,
      remainingDays,
      totalDays,
    };
  }

  const amountPaise = Math.min(
    Math.round((fullDifferencePaise * remainingMs) / totalMs),
    fullDifferencePaise,
  );

  return { fromPlanKey, toPlanKey, interval, fullDifferencePaise, amountPaise, remainingDays, totalDays };
}
