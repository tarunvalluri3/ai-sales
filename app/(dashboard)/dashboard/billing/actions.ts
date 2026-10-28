"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth";
import { requireBusinessContext } from "@/lib/business-context";
import { logAndGetUserMessage } from "@/lib/errors";
import { PLAN_KEYS } from "@/lib/plans";
import { billingIdentitySchema, parseBillingIdentityForm } from "@/lib/billing-identity";
import { getBillingIdentityForBusiness, getEntitlementForBusiness } from "@/lib/subscription";
import {
  confirmMonthlyCheckout,
  confirmOrderCheckout,
  startAnnualCheckout,
  startMonthlyCheckout,
  updateBillingDetails,
  type CheckoutSession,
} from "@/lib/billing-checkout";
import { cancelAtPeriodEnd, changePlan, type PlanChangeResult } from "@/lib/billing-plan-change";

/**
 * The billing Server Actions. Phase 17b (STATE.md).
 *
 * **Every one of these is `org:admin` only**, via
 * `requireAuthContext({ role: "org:admin" })` -- the same hard gate
 * /dashboard/profile and /dashboard/notifications use, rather than the
 * `requireMinRole` tiering used for day-to-day mutations. Spending a
 * business's money and cancelling its service are not things a sales agent
 * or an analyst should be able to do, and hiding the page is not an
 * authorization boundary: each action checks for itself.
 *
 * **`businessId` always comes from `requireBusinessContext()`**, never from
 * the form. **No action accepts an amount.** The plan key is the only
 * billing input a client supplies, it is validated against `PLAN_KEYS`,
 * and every price is derived server-side from `lib/plans.ts` -- so the
 * worst a tampered form can do is ask to buy a different one of the three
 * published plans, at that plan's published price.
 */

export type BillingActionState = {
  error?: string;
  /** Set when the browser must open Razorpay Checkout to finish. */
  session?: CheckoutSession;
  /** Set for a change that completed with no payment. */
  notice?: string;
  success?: boolean;
};

const planKeySchema = z.enum(PLAN_KEYS);

const startCheckoutSchema = z.object({
  planKey: planKeySchema,
  interval: z.enum(["monthly", "annual"]),
});

/** Starts a first subscription, or re-subscribes after a lapse. */
export async function startCheckoutAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  const parsedPlan = startCheckoutSchema.safeParse({
    planKey: formData.get("planKey"),
    interval: formData.get("interval"),
  });
  if (!parsedPlan.success) return { error: "Choose a plan and a billing period." };

  const parsedIdentity = parseBillingIdentityForm(formData);
  if (!parsedIdentity.ok) return { error: parsedIdentity.error };

  try {
    const session =
      parsedPlan.data.interval === "annual"
        ? await startAnnualCheckout({
            businessId,
            userId,
            planKey: parsedPlan.data.planKey,
            identity: parsedIdentity.identity,
          })
        : await startMonthlyCheckout({
            businessId,
            userId,
            planKey: parsedPlan.data.planKey,
            identity: parsedIdentity.identity,
          });
    return { session };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

const confirmSubscriptionSchema = z.object({
  paymentId: z.string().trim().min(1),
  signature: z.string().trim().min(1),
});

/**
 * The Checkout callback for a mandate. **UI only**: it verifies the
 * signature and records which plan the customer committed to, and the
 * webhook is what moves the status and the billing period when money
 * actually moves. A customer who closes the tab here is not left
 * inconsistent -- they are left exactly where the webhook will find them.
 *
 * Note what is *not* a parameter: the subscription id. It is read from our
 * own row, because verifying a signature against a value the same client
 * supplied would prove nothing.
 */
export async function confirmSubscriptionCheckoutAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId } = await requireBusinessContext();

  const parsed = confirmSubscriptionSchema.safeParse({
    paymentId: formData.get("paymentId"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: "We could not read that payment result. Please contact us." };

  try {
    await confirmMonthlyCheckout({ businessId, ...parsed.data });
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/billing");
  revalidatePath("/onboarding");
  return { success: true, notice: "Payment method authorised." };
}

const confirmOrderSchema = z.object({
  orderId: z.string().trim().min(1),
  paymentId: z.string().trim().min(1),
  signature: z.string().trim().min(1),
  planKey: planKeySchema,
  purpose: z.enum(["annual", "upgrade_prorata"]),
});

/**
 * The Checkout callback for a one-time payment (the annual plan, or a
 * pro-rata upgrade). Applies the same patch the `order.paid` webhook
 * applies, so whichever arrives first wins and the other is a no-op.
 *
 * `orderId` is checked against the order id we stored when we created it
 * (`confirmOrderCheckout`), so a callback cannot name an order this
 * business never started.
 */
export async function confirmOrderCheckoutAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId } = await requireBusinessContext();

  const parsed = confirmOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    paymentId: formData.get("paymentId"),
    signature: formData.get("signature"),
    planKey: formData.get("planKey"),
    purpose: formData.get("purpose"),
  });
  if (!parsed.success) return { error: "We could not read that payment result. Please contact us." };

  try {
    await confirmOrderCheckout({ businessId, ...parsed.data });
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/billing");
  revalidatePath("/onboarding");
  return { success: true, notice: "Payment received." };
}

/**
 * "Update payment method" for a subscription whose renewal has failed
 * (`past_due`): authorises a fresh card on the CURRENT plan. Checkout opens in
 * the browser; the retry's `subscription.charged` webhook is what moves the
 * business back to `active` and the agent back on -- nothing is assumed here.
 *
 * Deliberately limited to `past_due`. Starting a new mandate cancels the old
 * one immediately (startMonthlyCheckout), which is right for a mandate that is
 * already failing and wrong for a healthy one: a customer who opened the sheet
 * and closed it would be left with no mandate and no renewal. Swapping the
 * card on a healthy mandate needs a provider-side flow this app does not have
 * yet, and is not offered. An expired plan re-subscribes through "Choose a
 * plan" instead.
 *
 * Billing name and GSTIN come from what the business has already saved, run
 * through the same schema the checkout form uses.
 */
export async function updatePaymentMethodAction(): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  const entitlement = await getEntitlementForBusiness(businessId);
  if (entitlement.status !== "past_due" || entitlement.billingInterval !== "monthly") {
    return { error: "There is no failed payment to fix right now." };
  }

  const saved = await getBillingIdentityForBusiness(businessId);
  const identity = billingIdentitySchema.safeParse({
    name: saved?.name ?? "",
    address: saved?.address ?? "",
    stateCode: saved?.stateCode ?? "",
    gstin: saved?.gstin ?? "",
  });
  if (!identity.success) {
    return { error: "Complete your billing details first, then update your payment method." };
  }

  try {
    const session = await startMonthlyCheckout({
      businessId,
      userId,
      planKey: entitlement.planKey,
      identity: identity.data,
    });
    return { session };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

/** Upgrade (immediately, pro-rated) or downgrade (at period end). */
export async function changePlanAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  const parsedPlan = planKeySchema.safeParse(formData.get("planKey"));
  if (!parsedPlan.success) return { error: "Choose a plan." };

  const parsedIdentity = parseBillingIdentityForm(formData);
  if (!parsedIdentity.ok) return { error: parsedIdentity.error };

  let result: PlanChangeResult;
  try {
    result = await changePlan({
      businessId,
      userId,
      toPlanKey: parsedPlan.data,
      identity: parsedIdentity.identity,
    });
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (result.outcome === "checkout_required") {
    return { session: result.session };
  }

  revalidatePath("/dashboard/billing");

  if (result.outcome === "scheduled") {
    return {
      success: true,
      notice: `Your plan will change on ${formatIstDate(result.effectiveAt)}. Nothing changes before then — you keep everything you have paid for.`,
    };
  }

  if (result.outcome === "reauthorisation_required") {
    return {
      success: true,
      notice: `Your bank's mandate cannot be repriced, so your current one will stop on ${formatIstDate(result.renewBefore)}. Subscribe to the new plan before then and nothing will be interrupted.`,
    };
  }

  return { success: true, notice: "Your plan has been updated." };
}

/** Cancel at period end, keeping access until then. */
export async function cancelSubscriptionAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  // A type-to-confirm gate, the same shape /dashboard/profile's delete
  // uses: cancelling stops a live sales channel, and a mis-click should
  // not be enough to do it.
  if (formData.get("confirm") !== "CANCEL") {
    return { error: 'Type CANCEL to confirm.' };
  }

  try {
    const { accessUntil } = await cancelAtPeriodEnd({ businessId, userId });
    revalidatePath("/dashboard/billing");
    return {
      success: true,
      notice: `Cancelled. You keep full access until ${formatIstDate(accessUntil)}, the end of the period you have paid for.`,
    };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

/**
 * Saves the customer's billing name, address, state and GSTIN (Phase 17c).
 * `org:admin` only, like every other billing action.
 *
 * **Changes apply to future invoices only.** Issued invoices are immutable
 * snapshots, so nothing here can alter one. What it DOES do is issue any
 * invoice that was parked for want of these details -- the reply says so, so
 * the customer sees the missing document arrive.
 */
export async function updateBillingDetailsAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  const parsedIdentity = parseBillingIdentityForm(formData);
  if (!parsedIdentity.ok) return { error: parsedIdentity.error };

  try {
    const { invoicesIssued } = await updateBillingDetails({
      businessId,
      userId,
      identity: parsedIdentity.identity,
    });
    revalidatePath("/dashboard/billing");
    return {
      success: true,
      notice:
        invoicesIssued > 0
          ? `Billing details saved. We issued ${invoicesIssued === 1 ? "the invoice" : `${invoicesIssued} invoices`} that ${invoicesIssued === 1 ? "was" : "were"} waiting on them and emailed ${invoicesIssued === 1 ? "it" : "them"} to you.`
          : "Billing details saved. They apply to your next invoice; invoices already issued are never changed.",
    };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

/** Customers are India-only for v1, so dates are shown in IST. */
function formatIstDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
