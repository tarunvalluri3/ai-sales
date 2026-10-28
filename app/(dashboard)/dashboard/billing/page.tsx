import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBillingIdentityForBusiness, getEntitlementForBusiness } from "@/lib/subscription";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isRazorpayConfigured, razorpayKeyMode } from "@/lib/razorpay";
import { listBillingDocuments } from "@/lib/invoice-queries";
import { SUPPLIER } from "@/lib/invoice-config";
import { GST_RATE_PERCENT, ORDERED_PLANS, PLANS, formatPaiseAsInr } from "@/lib/plans";
import { PermissionNotice } from "../_components/state-views";
import { BillingPanel } from "./billing-panel";
import { BillingDetailsCard } from "./billing-details";
import { PaymentHistory } from "./payment-history";

export const metadata = { title: "Billing | Waves AI Pilot" };

/**
 * The billing page: plan and usage (Phase 17b), plus -- Phase 17c -- the
 * customer's billing details and their payment history with downloadable
 * GST tax invoices and credit notes.
 *
 * **`org:admin` only, for everything on it, invoices included.** Spending
 * a business's money and cancelling its service are not things a sales
 * agent or an analyst should be able to do, and an invoice carries the
 * business's GSTIN, address and spend, so whoever may see Billing may see
 * its invoices and nobody else may. The Server Actions and the PDF download
 * routes each re-check the role for themselves
 * (`requireAuthContext({ role: "org:admin" })`,
 * lib/billing-download.ts), because a page that declines to render a link
 * is an explanation, not an authorization boundary. (The database lets any
 * member of the business SELECT its own invoices through RLS; this app
 * deliberately narrows that to admins.)
 *
 * **Test mode is stated while it is true.** The banner shows only while the
 * configured Razorpay keys are TEST keys, and disappears by itself the day
 * live keys are set -- there is no flag to forget to flip.
 */
export default async function BillingPage() {
  const { businessId, businessName, orgRole, contactEmail } = await requireBusinessContext();

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
  const [entitlement, quota, identity, documents] = await Promise.all([
    getEntitlementForBusiness(businessId),
    // The same count the chat path enforces on, so the number shown here
    // and the number that stops the AI are the same number.
    checkReplyQuota(supabase, businessId),
    getBillingIdentityForBusiness(businessId),
    listBillingDocuments(businessId),
  ]);

  const configured = isRazorpayConfigured();
  const testMode = razorpayKeyMode() !== "live";
  // What the forms start from: what is saved, else the business's own name.
  const identityDefaults = {
    name: identity?.name ?? businessName,
    address: identity?.address ?? "",
    stateCode: identity?.stateCode ?? "",
    gstin: identity?.gstin ?? "",
  };
  const hasHeldInvoice = documents.holds.some(
    (hold) => hold.reason === "missing_customer_details" || hold.reason === "invalid_customer_details",
  );
  const plan = PLANS[entitlement.planKey];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ds-text-primary">Billing</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Your plan, what you have used this period, when you are next charged, and every invoice
          we have issued you.
        </p>
      </header>

      {/* Stated to the customer while it is true: a payment form that
          cannot take a real payment must say so, or it is misleading. Keyed
          on the configured keys, so it goes away on its own with live keys. */}
      {testMode ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-ds-md border border-ds-warning bg-ds-surface p-4"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">Payments are in test mode</p>
            <p className="text-sm text-ds-text-secondary">
              Nothing on this page charges a real card yet. Invoices issued for test payments are
              marked TEST: they are not tax documents and use a separate number series. We turn real
              payments on only after invoicing has been checked end to end.
            </p>
          </div>
        </div>
      ) : null}

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
          graceUntil: entitlement.graceUntil,
        }}
        usage={{
          repliesUsed: quota.repliesUsed,
          replyQuota: quota.replyQuota,
          degraded: quota.degraded,
        }}
        identity={identityDefaults}
        plans={ORDERED_PLANS.map((p) => ({
          key: p.key,
          name: p.name,
          monthlyPricePaise: p.monthlyPricePaise,
          annualPricePaise: p.annualPricePaise,
          monthlyReplyQuota: p.monthlyReplyQuota,
          seatsLabel: p.seatsLabel,
        }))}
        gstRatePercent={GST_RATE_PERCENT}
        supplierStateName={SUPPLIER.stateName}
      />

      <PaymentHistory
        invoices={documents.invoices}
        creditNotes={documents.creditNotes}
        holds={documents.holds}
        isTrial={entitlement.isTrial}
      />

      <BillingDetailsCard
        defaults={identityDefaults}
        gstRatePercent={GST_RATE_PERCENT}
        supplierStateName={SUPPLIER.stateName}
        hasHeldInvoice={hasHeldInvoice}
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
