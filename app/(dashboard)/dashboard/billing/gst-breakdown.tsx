import { formatPaiseAsInr, formatPaiseExact, taxAmountPaise, taxableValuePaise } from "@/lib/plans";

/**
 * "Plan price + GST 18% = total" for an amount, everywhere an amount is shown
 * (plan cards, next charge, the onboarding plan step).
 *
 * Every price in lib/plans.ts is the GST-INCLUSIVE gross a customer is
 * charged, so the plan price here is the taxable value *derived* from that
 * gross and the GST is the remainder -- the same split the tax invoice uses
 * (taxableValuePaise / taxAmountPaise), so what is shown and what is invoiced
 * can never differ by a paisa. The rate is passed in from lib/plans.ts's
 * GST_RATE_PERCENT by the page; nothing is hardcoded here.
 */
export function GstBreakdown({
  grossPaise,
  gstRatePercent,
  className = "",
}: {
  grossPaise: number;
  gstRatePercent: number;
  className?: string;
}) {
  return (
    <span className={`text-2xs text-ds-text-muted ${className}`}>
      {formatPaiseExact(taxableValuePaise(grossPaise))} + {formatPaiseExact(taxAmountPaise(grossPaise))} GST (
      {gstRatePercent}%) = {formatPaiseAsInr(grossPaise)}
    </span>
  );
}
