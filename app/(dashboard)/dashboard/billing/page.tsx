import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBillingIdentityForBusiness, getEntitlementForBusiness } from "@/lib/subscription";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { GST_RATE_PERCENT, ORDERED_PLANS, PLANS, formatPaiseAsInr } from "@/lib/plans";
import { PermissionNotice } from "../_components/state-views";
import { BillingPanel } from "./billing-panel";

export const metadata = { title: "Billing | Waves AI Pilot" };

/**
 * The minimal billing entry point (Phase 17b, STATE.md): enough to
 * subscribe, change plan and cancel, and nothing more. **The full billing
 * page is Phase 17c** -- invoices, payment history, downloadable GST
 * documents -- and is deliberately not started here.
 *
 * `org:admin` only. Spending a business's money and cancelling its service
 * are not things a sales agent or an analyst should be able to do. The
 * Server Actions each re-check the role for themselves
 * (`requireAuthContext({ role: "org:admin" })`), because a page that
 * declines to render a form is an explanation, not an authorization
 * boundary.
 *
 * **Nothing here is live.** The Razorpay keys in use are test keys, and
 * going live is blocked on 17c issuing GST invoices -- charging an Indian
 * customer without a tax invoice is not lawful. The banner below says so
 * to the customer rather than leaving it only in STATE.md.
 */
export default async function BillingPage() {
  const { businessId, orgRole, contactEmail } = await requireBusinessContext();

  if (!hasMinRole(orgRole, "org:admin")) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-ds-text-primary">Billing</h1>
          <p className="text-sm text-ds-text-secondary">
            Only an organisation admin can see or change billing.
          </p>
        </header>
        <PermissionNotice />
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const [entitlement, quota, identity] = await Promise.all([
    getEntitlementForBusiness(businessId),
    // The same count the chat path enforces on, so the number shown here
    // and the number that stops the AI are the same number.
    checkReplyQuota(supabase, businessId),
    getBillingIdentityForBusiness(businessId),
  ]);

  const configured = isRazorpayConfigured();
  const plan = PLANS[entitlement.planKey];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ds-text-primary">Billing</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Your plan, what you have used this period, and when you are next charged. Invoices arrive by
          email.
        </p>
      </header>

      {/* Stated to the customer, not just recorded internally: a payment
          form that cannot take a real payment must say so, or it is
          misleading. */}
      <div
        role="status"
        className="flex items-start gap-3 rounded-ds-md border border-ds-warning bg-ds-surface p-4"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ds-text-primary">Payments are in test mode</p>
          <p className="text-sm text-ds-text-secondary">
            Nothing on this page charges a real card yet. We turn payments on once GST invoicing is
            finished — we will not take money from you without issuing a tax invoice for it.
          </p>
        </div>
      </div>

      {!configured ? (
        <div
          role="status"
          className="rounded-ds-md border border-ds-border bg-ds-surface p-4 text-sm text-ds-text-secondary"
        >
          Payments are not set up on this deployment yet, so there is nothing to subscribe to here.
          Your plan and usage below are accurate.
        </div>
      ) : null}

      {!contactEmail ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-ds-md border border-ds-warning bg-ds-surface p-4"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">No billing email set</p>
            <p className="text-sm text-ds-text-secondary">
              Payment receipts, renewal reminders and your GST invoices all go to your business contact
              email, and there is not one on this account.
            </p>
            <Link href="/dashboard/profile" className="text-sm font-medium text-ds-accent hover:underline">
              Add a contact email
            </Link>
          </div>
        </div>
      ) : null}

      <BillingPanel
        configured={configured}
        entitlement={{
          planKey: entitlement.planKey,
          planName: entitlement.planName,
          status: entitlement.status,
          grandfathered: entitlement.grandfathered,
          isTrial: entitlement.isTrial,
          serving: entitlement.serving,
          notServingReason: entitlement.notServingReason,
          periodStart: entitlement.periodStart,
          periodEnd: entitlement.periodEnd,
          trialEndsAt: entitlement.trialEndsAt,
          cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
          scheduledPlanKey: entitlement.scheduledPlanKey,
          billingInterval: entitlement.billingInterval,
          hasPaymentMethod: entitlement.hasPaymentMethod,
          pastDueSince: entitlement.pastDueSince,
        }}
        usage={{
          repliesUsed: quota.repliesUsed,
          replyQuota: quota.replyQuota,
          degraded: quota.degraded,
        }}
        identity={{ stateCode: identity?.stateCode ?? null, gstin: identity?.gstin ?? null }}
        plans={ORDERED_PLANS.map((p) => ({
          key: p.key,
          name: p.name,
          monthlyPricePaise: p.monthlyPricePaise,
          annualPricePaise: p.annualPricePaise,
          monthlyReplyQuota: p.monthlyReplyQuota,
          seatsLabel: p.seatsLabel,
        }))}
        gstRatePercent={GST_RATE_PERCENT}
      />

      <p className="max-w-2xl text-sm text-ds-text-muted">
        Your {plan.name} plan includes{" "}
        {plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies a period at{" "}
        {formatPaiseAsInr(plan.monthlyPricePaise)} / month, inclusive of {GST_RATE_PERCENT}% GST. The
        full comparison is on the{" "}
        <Link href="/pricing" className="font-medium text-ds-accent hover:underline">
          pricing page
        </Link>
        , and the cancellation terms are in our{" "}
        <Link href="/refunds" className="font-medium text-ds-accent hover:underline">
          Cancellation and Refunds Policy
        </Link>
        .
      </p>
    </div>
  );
}
