/**
 * The one definition of what each plan costs and what it entitles a
 * business to. Phase 17a (STATE.md): the entitlement layer, built before
 * any Razorpay code so that the quotas the public pricing page has
 * advertised since 2026-10-19 become enforceable.
 *
 * NOT "server-only": `app/(dashboard)/pricing/page.tsx` renders from this
 * registry, which is the whole point. Before this file, that page held its
 * own `PLANS` array and `lib/usage-limit.ts` read one global
 * `AI_MONTHLY_TOKEN_LIMIT` env var -- two unrelated sets of numbers, in
 * different units (the page sold *replies*, the code counted *tokens*), so
 * the advertised quota and the enforced quota could not even be compared,
 * let alone kept in step. There is now exactly one number per plan, and
 * the assertions at the foot of this file make changing one of them
 * without the other a `npm run typecheck` failure rather than a silent
 * mis-sale.
 *
 * Prices are in **paise** (integer), never rupees-as-float: 1,499.00 is
 * 149_900. **Every price in this file is GST-INCLUSIVE** (decided
 * 2026-10-21, superseding the earlier exclusive-of-GST proposal): 149_900
 * is the total a customer is charged, with 18% GST already inside it. The
 * taxable value and the tax are *derived* from that gross by the helpers
 * below -- nothing is added on top at display or checkout time, and
 * Phase 17b's invoices must split the gross the same way (STATE.md).
 *
 * Channel entitlements are **data**, not code. Instagram is `false` on
 * every plan today -- not because the feature is missing (Phase 26 built
 * it) but because Meta App Review and Business Verification gate serving
 * an account this app does not itself manage (STATE.md). The day that
 * clears, Instagram ships on Growth and Scale by editing two booleans
 * below. No migration, no deploy-order problem, no second source of truth.
 */

export const PLAN_KEYS = ["starter", "growth", "scale"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/**
 * Every channel a prospect can reach a business's AI employee on.
 * `website` is the widget, which every plan includes -- it is listed here
 * rather than assumed so that a future "website only on paid plans"
 * question is a data change too.
 */
export const CHANNEL_KEYS = ["website", "whatsapp", "instagram"] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/**
 * India-only for v1, so one rate, applied to every plan. It is the rate
 * *contained in* each gross price, not a surcharge on top of it. Must stay
 * a whole number: the integer arithmetic below depends on it.
 */
export const GST_RATE_PERCENT = 18;

/** Confirmed 2026-10-21: 14 days, 200 AI replies, one per organisation ever. */
export const TRIAL_DAYS = 14;
export const TRIAL_REPLY_QUOTA = 200;

/**
 * Confirmed 2026-10-21: after a failed payment a business keeps serving
 * for 5 days. Deliberately generous about *serving* and strict about
 * *quota* -- a card that failed is a billing problem we should absorb for
 * a few days, while a quota that is used up is the thing being sold.
 */
export const PAST_DUE_GRACE_DAYS = 5;

export type PlanDefinition = {
  readonly key: PlanKey;
  readonly name: string;
  readonly tagline: string;
  /** GST-INCLUSIVE gross, in paise: the total charged per month. */
  readonly monthlyPricePaise: number;
  /** GST-INCLUSIVE gross, in paise: the total charged per year (two months free). */
  readonly annualPricePaise: number;
  /** AI replies per billing period. The unit the pricing page sells in. */
  readonly monthlyReplyQuota: number;
  readonly seatsLabel: string;
  readonly featured: boolean;
  readonly channels: Readonly<Record<ChannelKey, boolean>>;
  readonly features: readonly string[];
};

/**
 * Prices, quotas, seats, taglines and feature lists are exactly the ones
 * the pricing page has published since 2026-10-19 (user-confirmed
 * 2026-10-21); this phase moved them, it did not change them. The
 * WhatsApp footnote marker is kept in Growth's feature list because the
 * page still renders that footnote underneath the cards.
 */
export const PLANS = {
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "For a single website, getting your first AI-qualified leads.",
    monthlyPricePaise: 149_900,
    annualPricePaise: 1_499_000,
    monthlyReplyQuota: 1_000,
    seatsLabel: "1 team member",
    featured: false,
    channels: { website: true, whatsapp: false, instagram: false },
    features: [
      "AI sales employee on your website",
      "Products, services and FAQs",
      "Knowledge from pasted text (up to 25 documents)",
      "Lead capture, scoring and qualification",
      "Human handoff and live takeover",
      "Consent notice and 24-month data retention",
      "Email support",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    tagline: "For a team that wants recommendations, bookings and WhatsApp.",
    monthlyPricePaise: 399_900,
    annualPricePaise: 3_999_000,
    monthlyReplyQuota: 3_000,
    seatsLabel: "3 team members",
    featured: true,
    channels: { website: true, whatsapp: true, instagram: false },
    features: [
      "Everything in Starter",
      "WhatsApp Business messaging *",
      "Product and service recommendations with photos",
      "Appointment booking with availability rules",
      "Knowledge from file upload and website import (up to 200 documents)",
      "Full funnel analytics with CSV export",
      "Customer profiles, tags and segments",
      "Business hours, team assignment and SLA routing",
    ],
  },
  scale: {
    key: "scale",
    name: "Scale",
    tagline: "For a sales team running automation at volume.",
    monthlyPricePaise: 999_900,
    annualPricePaise: 9_999_000,
    monthlyReplyQuota: 10_000,
    seatsLabel: "10 team members",
    featured: false,
    channels: { website: true, whatsapp: true, instagram: false },
    features: [
      "Everything in Growth",
      "Automation workflows with delays and conditions",
      "AI Sales Copilot daily priorities and briefs",
      "Outbound webhooks on qualified leads",
      "Unlimited knowledge documents",
      "Role-based access across four permission tiers",
      "Audit log of sensitive actions",
      "Priority email and phone support",
    ],
  },
} as const satisfies Record<PlanKey, PlanDefinition>;

/** Cheapest first -- the order the pricing page renders and sells in. */
export const ORDERED_PLANS: readonly PlanDefinition[] = PLAN_KEYS.map((key) => PLANS[key]);

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

export function planFor(key: PlanKey): PlanDefinition {
  return PLANS[key];
}

/**
 * The only way anything in this codebase should ask "is this business
 * allowed on this channel?" -- via lib/subscription.ts, which resolves the
 * plan key first and is what pages, route handlers and Server Actions
 * call.
 */
export function isChannelEnabledForPlan(planKey: PlanKey, channel: ChannelKey): boolean {
  return PLANS[planKey].channels[channel];
}

/* ------------------------------------------------------------------ *
 * GST derivation from a GST-inclusive gross.
 *
 * The rounding rule (one rule, so the pricing page, the reminder emails
 * and Phase 17b's invoices can never disagree by a paisa):
 *
 *   taxable = round(gross / 1.18, 2 decimal places) -- i.e. to the paisa
 *   tax     = gross - taxable
 *
 * Tax is the *remainder*, never rounded independently, so that
 * taxable + tax equals the gross the customer was charged EXACTLY.
 *
 * Intra-state supply is split into CGST + SGST. Those two are never both
 * rounded: CGST = floor(tax / 2) and SGST = tax - CGST, so
 * CGST + SGST === tax by construction, and any odd paisa lands on SGST.
 * Scale at ₹9,999 is the case that breaks naive rounding: tax is
 * ₹1,525.27, each half is ₹762.635, and rounding both up would bill
 * ₹1,525.28 -- a paisa more than the tax inside the price.
 *
 * Inter-state supply is a single IGST line at the full tax amount.
 *
 * Everything is integer paise: no float division, so no 0.1 + 0.2 drift.
 * "Round" is half-up on the exact integer quotient.
 * ------------------------------------------------------------------ */

/** The taxable value contained in a GST-inclusive gross, to the paisa. */
export function taxableValuePaise(grossPaise: number): number {
  const divisor = 100 + GST_RATE_PERCENT;
  // round-half-up(gross * 100 / divisor), computed entirely in integers.
  return Math.floor((grossPaise * 200 + divisor) / (2 * divisor));
}

/** The GST contained in a GST-inclusive gross: gross minus the taxable value. */
export function taxAmountPaise(grossPaise: number): number {
  return grossPaise - taxableValuePaise(grossPaise);
}

export type GstSupply = "intra-state" | "inter-state";

export type GstBreakdown = {
  readonly grossPaise: number;
  readonly taxablePaise: number;
  readonly taxPaise: number;
} & (
  | { readonly supply: "intra-state"; readonly cgstPaise: number; readonly sgstPaise: number }
  | { readonly supply: "inter-state"; readonly igstPaise: number }
);

/**
 * The invoice-line split of a gross price. `intra-state` when the supplier
 * and the customer's place of supply are in the same state (CGST + SGST),
 * `inter-state` otherwise (IGST).
 */
export function gstBreakdown(grossPaise: number, supply: GstSupply): GstBreakdown {
  const taxablePaise = taxableValuePaise(grossPaise);
  const taxPaise = grossPaise - taxablePaise;
  return { grossPaise, taxablePaise, ...splitGstTax(taxPaise, supply) };
}

/**
 * The CGST / SGST / IGST layout of a tax amount that has ALREADY been
 * determined. This is the single place the floor-and-remainder rule lives:
 * `gstBreakdown` uses it, and so do Phase 17c's credit notes, which derive
 * a note's tax proportionally from the invoice it reverses and therefore
 * start from a tax figure rather than a gross.
 */
export function splitGstTax(
  taxPaise: number,
  supply: GstSupply,
): { readonly taxPaise: number } & (
  | { readonly supply: "intra-state"; readonly cgstPaise: number; readonly sgstPaise: number }
  | { readonly supply: "inter-state"; readonly igstPaise: number }
) {
  if (supply === "inter-state") {
    return { taxPaise, supply, igstPaise: taxPaise };
  }
  const cgstPaise = Math.floor(taxPaise / 2);
  return { taxPaise, supply, cgstPaise, sgstPaise: taxPaise - cgstPaise };
}

/**
 * 1,499 from 149_900, with Indian digit grouping. Rounds to whole rupees,
 * which is only correct for the GST-inclusive GROSS prices (all whole
 * rupees). Never use it for a taxable value or a tax amount -- those carry
 * paise (₹8,473.73) and would silently display wrong.
 */
export function formatPaiseAsInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * 1,270.34 from 127_034, to the paisa. For the taxable value and the GST
 * amount of a breakdown, which carry paise that `formatPaiseAsInr` would
 * round away.
 */
export function formatPaiseExact(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1,000 AI replies / month" -- the quota as the pricing page sells it. */
export function formatReplyQuota(quota: number): string {
  return `${quota.toLocaleString("en-IN")} AI replies / month`;
}

/* ------------------------------------------------------------------ *
 * Drift assertions -- a build failure, not a runtime surprise.
 *
 * The Advertised* types below restate, as literal types, the figures the
 * public pricing page promises. They are deliberate duplication: their job
 * is to be a second, independent statement of the published commitment,
 * pinned to the enforced registry above by a compile-time check. Editing
 * a price, a quota or a channel's availability in PLANS without editing
 * the matching entry here fails `npm run typecheck` with the message in
 * the failing branch -- the same technique, and the same reason, as the
 * maxDuration assertion in app/api/chat/route.ts.
 *
 * Deleting these maps to "fix" such a failure is the one wrong move: the
 * failure means the published promise and the enforced entitlement have
 * parted company, and one of the two is now a lie to a paying customer.
 * ------------------------------------------------------------------ */

// All GST-INCLUSIVE grosses: the totals charged, 18% GST contained within.
type AdvertisedMonthlyPricePaise = { starter: 149_900; growth: 399_900; scale: 999_900 };
// "Two months free" = ten months' gross, so these are exactly 10x the monthly figures.
type AdvertisedAnnualPricePaise = { starter: 1_499_000; growth: 3_999_000; scale: 9_999_000 };
type AdvertisedMonthlyReplyQuota = { starter: 1_000; growth: 3_000; scale: 10_000 };
type AdvertisedWhatsappIncluded = { starter: false; growth: true; scale: true };
type AdvertisedInstagramIncluded = { starter: false; growth: false; scale: false };

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _pricesMatchAdvertised: Exact<
  { [K in PlanKey]: (typeof PLANS)[K]["monthlyPricePaise"] },
  AdvertisedMonthlyPricePaise
> extends true
  ? true
  : "lib/plans.ts: PLANS' monthly prices no longer match the prices /pricing advertises" = true;
void _pricesMatchAdvertised;

const _annualPricesMatchAdvertised: Exact<
  { [K in PlanKey]: (typeof PLANS)[K]["annualPricePaise"] },
  AdvertisedAnnualPricePaise
> extends true
  ? true
  : "lib/plans.ts: PLANS' annual prices no longer match the prices /pricing advertises" = true;
void _annualPricesMatchAdvertised;

const _quotasMatchAdvertised: Exact<
  { [K in PlanKey]: (typeof PLANS)[K]["monthlyReplyQuota"] },
  AdvertisedMonthlyReplyQuota
> extends true
  ? true
  : "lib/plans.ts: PLANS' reply quotas no longer match the quotas /pricing advertises" = true;
void _quotasMatchAdvertised;

const _whatsappMatchesAdvertised: Exact<
  { [K in PlanKey]: (typeof PLANS)[K]["channels"]["whatsapp"] },
  AdvertisedWhatsappIncluded
> extends true
  ? true
  : "lib/plans.ts: WhatsApp's per-plan availability no longer matches what /pricing advertises" = true;
void _whatsappMatchesAdvertised;

/**
 * Instagram is advertised as included in *no* plan ("not included in any
 * plan above", /pricing). This asserts the registry still says the same
 * thing, and is the line to change -- together with the booleans above
 * and that page's copy -- on the day Meta App Review clears.
 */
const _instagramIncludedInNoPlan: Exact<
  { [K in PlanKey]: (typeof PLANS)[K]["channels"]["instagram"] },
  AdvertisedInstagramIncluded
> extends true
  ? true
  : "lib/plans.ts: /pricing says Instagram is in no plan -- update that page's copy before enabling it here" = true;
void _instagramIncludedInNoPlan;
