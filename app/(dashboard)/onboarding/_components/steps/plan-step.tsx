"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BillingPanel } from "../../../dashboard/billing/billing-panel";
import type { BillingIdentityValues } from "../../../dashboard/billing/billing-details";
import { advanceOnboarding } from "../../actions";

type PlanSummary = {
  key: "starter" | "growth" | "scale";
  name: string;
  monthlyPricePaise: number;
  annualPricePaise: number;
  monthlyReplyQuota: number;
  seatsLabel: string;
};

type EntitlementSummary = {
  planKey: "starter" | "growth" | "scale";
  planName: string;
  status: string;
  grandfathered: boolean;
  isTrial: boolean;
  serving: boolean;
  notServingReason: string | null;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledPlanKey: "starter" | "growth" | "scale" | null;
  billingInterval: "monthly" | "annual" | null;
  hasPaymentMethod: boolean;
  pastDueSince: string | null;
  graceUntil: string | null;
};

/**
 * Stage 5: "Plan & billing". Embeds the real `BillingPanel` unchanged --
 * plan selection, Razorpay checkout and billing identity all stay exactly
 * what /dashboard/billing already ships, so nothing about payments is
 * reimplemented for the wizard. Every price here is GST-INCLUSIVE
 * (lib/plans.ts), so this step says "incl. GST", not the pasted spec's
 * "exclusive of GST" -- that line would have been a fabricated price.
 */
export function PlanStep({
  configured,
  entitlement,
  usage,
  identity,
  plans,
  gstRatePercent,
  supplierStateName,
}: {
  configured: boolean;
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  identity: BillingIdentityValues;
  plans: PlanSummary[];
  gstRatePercent: number;
  supplierStateName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // True while the server is verifying a Checkout result. Continue is held
  // until it answers: the browser's "payment succeeded" is never what marks
  // this step complete -- the server-side recheck in advanceOnboarding is.
  const [confirming, setConfirming] = useState(false);
  const valid = entitlement.serving;

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOnboarding("review");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=review");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ds-text-muted">
        Every price includes {gstRatePercent}% GST -- the split is shown under each amount, and nothing is added at checkout.
      </p>

      <BillingPanel
        configured={configured}
        entitlement={entitlement}
        usage={usage}
        identity={identity}
        plans={plans}
        gstRatePercent={gstRatePercent}
        supplierStateName={supplierStateName}
        onConfirmingChange={setConfirming}
      />

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/onboarding?step=channels")}
          className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {!valid ? (
            <span className="text-xs text-ds-text-muted">
              {configured ? "Choose a plan to continue" : "Nothing to configure on this deployment -- continue"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || confirming || (!valid && configured)}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
