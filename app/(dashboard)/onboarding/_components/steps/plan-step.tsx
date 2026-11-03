"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BillingPanel } from "../../../dashboard/billing/billing-panel";
import type { BillingIdentityValues } from "../../../dashboard/billing/billing-details";
import { advanceOnboarding } from "../../actions";
import { TRIAL_NOT_AVAILABLE_MESSAGE } from "@/lib/trial-messages";

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
  noSubscription: boolean;
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

/** Customers are India-only for v1, so dates are shown in IST (same as the billing page). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function notServingMessage(reason: string | null): string {
  switch (reason) {
    case "trial_already_used":
      return TRIAL_NOT_AVAILABLE_MESSAGE;
    case "trial_expired":
      return "Your free trial has ended. Choose a plan to go live.";
    case "subscription_unavailable":
      return "We could not load your plan just now. Refresh in a minute -- if it keeps happening, contact support.";
    default:
      return "Choose a plan to go live.";
  }
}

/**
 * Stage 5: "Plan & billing". Owner decision 2026-11-03: the trial needs NO
 * card, so while the trial is active this step is a confirmation ("your free
 * trial is on") with paying now as an option, not a payment wall. When there
 * is no trial (already used by this organisation, ended, or no plan at all)
 * it shows the real `BillingPanel`, unchanged -- plan selection, Razorpay
 * checkout and billing identity stay exactly what /dashboard/billing ships.
 *
 * The server is the authority: Continue only works when advanceOnboarding's
 * recheck finds the entitlement serving (lib/onboarding-steps.ts `plan`).
 * Every price is GST-INCLUSIVE (lib/plans.ts).
 */
export function PlanStep({
  configured,
  entitlement,
  usage,
  identity,
  plans,
  gstRatePercent,
  supplierStateName,
  trialReplyQuota,
  trialDays,
  trialChannels,
}: {
  configured: boolean;
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  identity: BillingIdentityValues;
  plans: PlanSummary[];
  gstRatePercent: number;
  supplierStateName: string;
  trialReplyQuota: number;
  trialDays: number;
  /** e.g. "your website widget, WhatsApp and Instagram" -- only the launched channels. */
  trialChannels: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // True while the server is verifying a Checkout result. Continue is held
  // until it answers: the browser's "payment succeeded" is never what marks
  // this step complete -- the server-side recheck in advanceOnboarding is.
  const [confirming, setConfirming] = useState(false);
  const valid = entitlement.serving;
  const onTrial = entitlement.isTrial && entitlement.serving;

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

  const gstNote = (
    <p className="text-xs text-ds-text-muted">
      Every price includes {gstRatePercent}% GST -- the split is shown under each amount, and nothing is added at checkout.
    </p>
  );

  const billingPanel = (
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
  );

  return (
    <div className="flex flex-col gap-6">
      {onTrial ? (
        <section
          aria-labelledby="trial-heading"
          className="flex flex-col gap-3 rounded-ds-lg border border-ds-accent bg-ds-surface-elevated p-5"
        >
          <h2 id="trial-heading" className="text-base font-semibold text-ds-text-primary">
            Your free trial is on -- no card needed
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ds-text-secondary">
            <li>
              {trialDays} days or {trialReplyQuota.toLocaleString("en-IN")} AI replies, whichever comes first
              {entitlement.trialEndsAt ? ` (ends ${formatDate(entitlement.trialEndsAt)})` : ""}.
            </li>
            <li>Includes {trialChannels}.</li>
            <li>
              {usage.degraded
                ? "Replies used: unavailable right now."
                : `Replies used so far: ${usage.repliesUsed.toLocaleString("en-IN")} of ${usage.replyQuota.toLocaleString("en-IN")}.`}
            </li>
            <li>When it ends, your AI stops replying until you choose a plan. Nothing is charged automatically.</li>
          </ul>
        </section>
      ) : (
        <p
          role="status"
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-4 py-3 text-sm text-ds-text-secondary"
        >
          {notServingMessage(entitlement.notServingReason)}
        </p>
      )}

      {onTrial ? (
        <details className="group rounded-ds-lg border border-ds-border bg-ds-surface">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent">
            <span className="group-open:hidden">Choose a paid plan now (optional)</span>
            <span className="hidden group-open:inline">Hide plans</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-ds-border p-5">
            {gstNote}
            {billingPanel}
          </div>
        </details>
      ) : (
        <>
          {gstNote}
          {billingPanel}
        </>
      )}

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
              {configured ? "Choose a plan to continue" : "Payments are not set up on this deployment yet"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || confirming || !valid}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : onTrial ? "Continue with the free trial" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
