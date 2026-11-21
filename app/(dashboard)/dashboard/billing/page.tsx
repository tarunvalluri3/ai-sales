import Link from "next/link";
import { AlertTriangle, Building2, CircleCheck, CreditCard, MapPin } from "lucide-react";
import { stateNameForCode } from "@/lib/india-states";
import { PageHeader, btnOutline, linkAccent } from "../_components/ui";
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
import { loadConnectedMetaChannels } from "@/lib/connected-meta-channels";
import { launchedMetaChannelNames } from "@/lib/plan-channel-copy";
import { channelLaunchSwitchesFromEnv } from "@/lib/entitlement-rules";
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
      <div className="flex flex-1 flex-col gap-8">
        <PageHeader icon={CreditCard} title="Billing" description="Only an organisation admin can see or change billing." />
        <PermissionNotice />
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const [entitlement, quota, identity, documents, connectedChannels] = await Promise.all([
    getEntitlementForBusiness(businessId),
    // The same count the chat path enforces on, so the number shown here
    // and the number that stops the AI are the same number.
    checkReplyQuota(supabase, businessId),
    getBillingIdentityForBusiness(businessId),
    listBillingDocuments(businessId),
    // Round 3, item 3: warn before Starter would cut off a connected channel.
    loadConnectedMetaChannels(businessId),
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

  const billingStateName = stateNameForCode(identity?.stateCode ?? null);
  const hasBillingDetails = Boolean(identity?.name && identity?.address && identity?.stateCode);

  const invoiceDetails = (
    <section aria-labelledby="invoice-details-heading" className="dx-card flex h-full flex-col gap-3 dx-card-pad">
      <h2 id="invoice-details-heading" className="dx-title">
        Invoice details
      </h2>
      <ul className="flex flex-col gap-2.5 text-sm text-ds-text-primary">
        <li className="flex items-center gap-4 text-base font-medium">
          <Building2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 break-words">{identityDefaults.name}</span>
        </li>
        {billingStateName ? (
          <li className="flex items-center gap-4">
            <MapPin className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {billingStateName}
          </li>
        ) : null}
        <li className="flex items-center gap-4">
          {hasBillingDetails ? (
            <CircleCheck className="size-5 shrink-0 text-ds-success-bright" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-5 shrink-0 text-ds-warning" strokeWidth={1.75} aria-hidden="true" />
          )}
          {hasBillingDetails ? "Billing details on file" : "Billing details not added yet"}
        </li>
      </ul>
      <a href="#billing-details" className={`${btnOutline} mt-auto w-full text-base`}>
        {hasBillingDetails ? "Edit billing details" : "Add billing details"}
      </a>
      <p className="text-center text-sm text-ds-text-secondary">Changes apply to future invoices.</p>
    </section>
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={CreditCard} title="Billing" description="Your plan, usage and payments in one place." />

      {/* Stated to the customer while it is true: a payment form that
          cannot take a real payment must say so, or it is misleading. Keyed
          on the configured keys, so it goes away on its own with live keys. */}
      {testMode ? (
        <div role="status" className="flex items-start gap-4 rounded-2xl bg-ds-warning-bg px-5 py-4">
          <AlertTriangle strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">Payments are in test mode</p>
            <p className="text-sm text-ds-text-primary">
              Nothing on this page charges a real card yet. Invoices issued for test payments are
              marked TEST: they are not tax documents and use a separate number series. We turn real
              payments on only after invoicing has been checked end to end.
            </p>
          </div>
        </div>
      ) : null}

      {!configured ? (
        <div role="status" className="rounded-2xl bg-ds-surface-soft px-5 py-4 text-sm text-ds-text-primary">
          Payments are not set up on this deployment yet, so there is nothing to subscribe to here.
          Your plan and usage below are accurate.
        </div>
      ) : null}

      {!contactEmail ? (
        <div role="status" className="flex items-start gap-4 rounded-2xl bg-ds-warning-bg px-5 py-4">
          <AlertTriangle strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">No billing email set</p>
            <p className="text-sm text-ds-text-primary">
              Payment receipts, renewal reminders and your GST invoices all go to your business contact
              email, and there is not one on this account.
            </p>
            <Link href="/dashboard/profile" className={`${linkAccent} w-fit underline`}>
              Add a contact email
            </Link>
          </div>
        </div>
      ) : null}

      <BillingPanel
        aside={invoiceDetails}
        configured={configured}
        metaChannelNames={launchedMetaChannelNames(channelLaunchSwitchesFromEnv())}
        connectedChannels={connectedChannels}
        entitlement={{
          planKey: entitlement.planKey,
          planName: entitlement.planName,
          status: entitlement.status,
          noSubscription: entitlement.noSubscription,
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
        savedDetails={{ stateName: billingStateName, complete: hasBillingDetails }}
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
        key={`${identityDefaults.name}|${identityDefaults.address}|${identityDefaults.stateCode}|${identityDefaults.gstin}`}
        defaults={identityDefaults}
        gstRatePercent={GST_RATE_PERCENT}
        supplierStateName={SUPPLIER.stateName}
        hasHeldInvoice={hasHeldInvoice}
      />

      <p className="max-w-3xl px-1 text-sm leading-relaxed text-ds-text-secondary">
        Your {plan.name} plan includes{" "}
        {plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies a period at{" "}
        {formatPaiseAsInr(plan.monthlyPricePaise)} / month, inclusive of {GST_RATE_PERCENT}% GST. The
        full comparison is on the{" "}
        <Link href="/pricing" className="font-medium text-ds-primary underline underline-offset-4">
          pricing page
        </Link>
        , and the cancellation terms are in our{" "}
        <Link href="/refunds" className="font-medium text-ds-primary underline underline-offset-4">
          Cancellation and Refunds Policy
        </Link>
        .
      </p>
    </div>
  );
}
