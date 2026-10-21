import "server-only";
import { getAppUrl } from "@/lib/app-url";
import { renderBrandedEmail, type BrandedEmail } from "@/lib/email-template";
import { GST_RATE_PERCENT, PLANS, formatPaiseAsInr, type PlanKey } from "@/lib/plans";
import type { BillingNoticeKind } from "@/lib/billing-notices";

/**
 * The billing lifecycle emails. Phase 17b (STATE.md).
 *
 * All of these go to the **business**, never to a prospect, so they keep
 * the Waves AI Pilot lockup (no `senderName`) and leave through
 * lib/email-sender.ts, which owns suppression, the from-address and reply
 * routing. Same shape as lib/usage-reminders.ts's two emails, and written
 * to the same standard: state the numbers, say plainly what the customer's
 * prospects see right now, and never make someone guess whether their site
 * is broken.
 *
 * **These are not invoices.** Phase 17c issues the GST tax invoice for
 * every payment, with the taxable value and the tax shown separately
 * (`gstBreakdown()`). Nothing here claims to be one, and nothing here is a
 * substitute for one -- which is the whole reason this phase stays in test
 * mode (STATE.md).
 *
 * Customers are India-only for v1, so every date is rendered in IST.
 */

/** Customers are India-only for v1, so dates are shown in IST. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function priceLine(planKey: PlanKey, interval: "monthly" | "annual" | null): string {
  const plan = PLANS[planKey];
  return interval === "annual"
    ? `${formatPaiseAsInr(plan.annualPricePaise)} / year, inclusive of ${GST_RATE_PERCENT}% GST`
    : `${formatPaiseAsInr(plan.monthlyPricePaise)} / month, inclusive of ${GST_RATE_PERCENT}% GST`;
}

export type BillingNoticeContext = {
  businessName: string;
  planKey: PlanKey;
  billingInterval: "monthly" | "annual" | null;
  /**
   * What the date in the email is about: the end of the paid period, or
   * the end of a grace window. Which one depends on the kind -- each
   * builder below says so.
   */
  periodEndIso: string;
};

export type BillingNoticeEmail = { subject: string; email: BrandedEmail };

const BILLING_URL = () => `${getAppUrl()}/dashboard/billing`;

/**
 * Builds the email for one notice kind. Exhaustive over
 * `BillingNoticeKind` -- adding a kind without a body here is a
 * `npm run typecheck` failure, not an email that silently never sends.
 */
export function buildBillingNoticeEmail(
  kind: BillingNoticeKind,
  context: BillingNoticeContext,
): BillingNoticeEmail {
  switch (kind) {
    case "subscription_active":
      return subscriptionActive(context);
    case "payment_failed":
      return paymentFailed(context);
    case "payment_recovered":
      return paymentRecovered(context);
    case "grace_lapsed":
      return graceLapsed(context);
    case "subscription_cancelled":
      return subscriptionCancelled(context);
    case "subscription_completed":
      return subscriptionCompleted(context);
    case "annual_renewal_14d":
      return annualRenewal(context, 14);
    case "annual_renewal_3d":
      return annualRenewal(context, 3);
    case "trial_ending_3d":
      return trialEnding(context);
  }
}

function subscriptionActive(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Your ${plan.name} plan is active - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: `${plan.name} is active`,
      paragraphs: [
        `Your payment went through and ${context.businessName}'s AI sales employee is now on the ${plan.name} plan.`,
        `That is ${plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies a period, and we will email you as you approach it rather than letting you find out from a quiet widget.`,
        "Your GST invoice follows separately.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Price", value: priceLine(context.planKey, context.billingInterval) },
        { label: "Included", value: `${plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies / period` },
        {
          label: context.billingInterval === "annual" ? "Renews on" : "Next charge",
          value: formatDate(context.periodEndIso),
        },
      ],
      cta: { label: "Open billing", url: BILLING_URL() },
      footnote: `Sent once per billing period to the contact email for ${context.businessName}.`,
    }),
  };
}

/**
 * The grace-period warning. `periodEndIso` here is the **grace deadline**,
 * not the billing period's end -- five days from the first failed charge
 * (PAST_DUE_GRACE_DAYS in lib/plans.ts).
 */
function paymentFailed(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Action needed: your payment did not go through - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: "Your payment did not go through",
      paragraphs: [
        `We could not collect the ${plan.name} payment for ${context.businessName}. This is usually an expired card or a bank-side limit, not anything you did.`,
        `Nothing has changed for your prospects. Your AI sales employee is still replying, with your full quota, until ${formatDate(context.periodEndIso)} while we keep retrying.`,
        `If it is still unpaid after that, the AI stops replying: visitors are told that someone from your team will follow up and the conversation is flagged in your dashboard. Your site does not break and nothing gets invented -- but those enquiries wait on a person.`,
        "Updating your payment method takes a minute and switches the retry back on.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Amount", value: priceLine(context.planKey, context.billingInterval) },
        { label: "Full access until", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Update payment method", url: BILLING_URL() },
      footnote: `Sent once per failed payment to the contact email for ${context.businessName}.`,
    }),
  };
}

function paymentRecovered(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Payment received - ${context.businessName} is all set`,
    email: renderBrandedEmail({
      heading: "That is sorted",
      paragraphs: [
        `Your ${plan.name} payment went through. ${context.businessName}'s AI sales employee is replying normally again, with the full quota for this period.`,
        "Nothing needs doing at your end.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Next charge", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Open billing", url: BILLING_URL() },
      footnote: `Sent to the contact email for ${context.businessName}.`,
    }),
  };
}

/**
 * Grace has run out. `periodEndIso` is when the failure episode began.
 *
 * Written to be specific rather than apologetic: the business needs to
 * know exactly what its visitors are seeing, because that is the thing it
 * is going to be asked about.
 */
function graceLapsed(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Your AI employee has paused - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: "Your AI employee has paused",
      paragraphs: [
        `We were not able to collect the ${plan.name} payment for ${context.businessName}, and the five days we keep everything running for have now passed.`,
        "Here is exactly what a visitor sees: the chat widget still opens and still works, and anyone who messages is told that someone from your team will follow up. Every one of those conversations is flagged in your dashboard, so nothing is lost. Your AI is not inventing answers and your site is not broken -- it has simply stopped generating replies.",
        "Paying switches it straight back on, with everything exactly where you left it: your knowledge, products, conversations and leads are all untouched.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Amount", value: priceLine(context.planKey, context.billingInterval) },
        { label: "Payment first failed", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Pay and switch it back on", url: BILLING_URL() },
      footnote: `Sent once to the contact email for ${context.businessName}.`,
    }),
  };
}

function subscriptionCancelled(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Cancelled - ${context.businessName} keeps access until ${formatDate(context.periodEndIso)}`,
    email: renderBrandedEmail({
      heading: "Your plan is cancelled",
      paragraphs: [
        `Your ${plan.name} plan for ${context.businessName} is cancelled and will not be charged again.`,
        `You keep everything until ${formatDate(context.periodEndIso)} -- the end of the period you have already paid for. After that your AI employee stops replying, and visitors are told that someone from your team will follow up.`,
        "Your data stays where it is. If you come back, your knowledge, products and conversations will all still be there.",
        "If you cancelled because something was not working, reply to this email and tell us. We would genuinely rather fix it.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Access until", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Open billing", url: BILLING_URL() },
      footnote: `Sent to the contact email for ${context.businessName}. Fees already paid are not refundable -- see our Cancellation and Refunds Policy.`,
    }),
  };
}

function subscriptionCompleted(context: BillingNoticeContext): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Your mandate has run its full term - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: "Time to re-authorise",
      paragraphs: [
        `Your ${plan.name} payment mandate for ${context.businessName} has completed every billing cycle it was set up for, so it will not charge again.`,
        `Nothing is wrong and nothing has been lost. You keep full access until ${formatDate(context.periodEndIso)}; after that your AI employee stops replying until a new mandate is in place.`,
        "Re-subscribing takes a minute and continues exactly where you are.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Access until", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Re-subscribe", url: BILLING_URL() },
      footnote: `Sent to the contact email for ${context.businessName}.`,
    }),
  };
}

/**
 * The annual renewal reminder, sent 14 and 3 days before the term ends.
 *
 * Annual is a one-time order, not a mandate, so **nothing renews itself**
 * -- which makes this email the only thing standing between a customer and
 * a silently stopped AI. It says so plainly rather than implying an
 * automatic renewal that does not exist.
 */
function annualRenewal(context: BillingNoticeContext, daysOut: number): BillingNoticeEmail {
  const plan = PLANS[context.planKey];
  return {
    subject: `Your annual plan ends in ${daysOut} days - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: `Your annual plan ends on ${formatDate(context.periodEndIso)}`,
      paragraphs: [
        `${context.businessName}'s ${plan.name} year is nearly up. Annual plans are paid in one go rather than by a recurring mandate, so this one will not renew by itself -- that is deliberate, and it means no surprise charge, but it does mean the renewal is yours to make.`,
        `Renew before ${formatDate(context.periodEndIso)} and nothing changes for your prospects. If the term ends unpaid, we keep everything running for five more days, and after that your AI employee stops replying: visitors are told that someone from your team will follow up and the conversation is flagged for you.`,
        "You can switch to monthly billing at the same time if that suits you better.",
      ],
      facts: [
        { label: "Plan", value: plan.name },
        { label: "Renewal", value: priceLine(context.planKey, "annual") },
        { label: "Term ends", value: formatDate(context.periodEndIso) },
      ],
      cta: { label: "Renew now", url: BILLING_URL() },
      footnote: `Sent 14 days and again 3 days before the term ends, to the contact email for ${context.businessName}.`,
    }),
  };
}

/**
 * The trial is nearly over and no payment method was ever authorised.
 *
 * The confirmed decision is that a payment method is required at signup,
 * so this should be a rare state -- a customer who started onboarding and
 * never finished checkout. Worth one email rather than a silent stop.
 */
function trialEnding(context: BillingNoticeContext): BillingNoticeEmail {
  return {
    subject: `Your free trial ends on ${formatDate(context.periodEndIso)} - ${context.businessName}`,
    email: renderBrandedEmail({
      heading: `Your trial ends on ${formatDate(context.periodEndIso)}`,
      paragraphs: [
        `${context.businessName}'s 14-day trial is nearly up and there is no payment method on the account yet, so nothing will be charged -- and nothing will continue either.`,
        "When the trial ends, your AI employee stops replying. Visitors are told that someone from your team will follow up and the conversation is flagged in your dashboard, so no enquiry is lost -- but it waits on a person.",
        "Picking a plan takes a minute, and everything you have set up stays exactly as it is.",
      ],
      facts: [
        { label: "Trial ends", value: formatDate(context.periodEndIso) },
        { label: "Plans from", value: priceLine("starter", "monthly") },
      ],
      cta: { label: "Choose a plan", url: BILLING_URL() },
      footnote: `Sent once, to the contact email for ${context.businessName}.`,
    }),
  };
}
