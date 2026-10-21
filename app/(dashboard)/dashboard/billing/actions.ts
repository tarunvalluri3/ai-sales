"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth";
import { requireBusinessContext } from "@/lib/business-context";
import { logAndGetUserMessage } from "@/lib/errors";
import { PLAN_KEYS } from "@/lib/plans";
import { isIndianStateCode } from "@/lib/india-states";
import {
  confirmMonthlyCheckout,
  confirmOrderCheckout,
  startAnnualCheckout,
  startMonthlyCheckout,
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

/**
 * The customer's place of supply, and optionally their GSTIN.
 *
 * Required at checkout, not optional, because Phase 17c cannot issue a
 * lawful tax invoice without it: the state code is what decides CGST+SGST
 * versus a single IGST line. Validated against the closed registry in
 * lib/india-states.ts rather than accepted as free text.
 *
 * The GSTIN is optional (most customers will not be registered) and is
 * upper-cased before validation, so a lower-case entry is accepted rather
 * than rejected for a reason the customer cannot see. Its first two digits
 * must match the declared state, because a GSTIN carries its holder's
 * state code and an invoice showing two different states would be wrong on
 * its face.
 */
const identitySchema = z
  .object({
    stateCode: z.string().refine(isIndianStateCode, "Select your state."),
    gstin: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => value === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value),
        "That does not look like a valid 15-character GSTIN.",
      )
      .transform((value) => (value === "" ? null : value)),
  })
  .refine(
    (value) => value.gstin === null || value.gstin.slice(0, 2) === value.stateCode,
    "Your GSTIN's state code does not match the state you selected.",
  );

const startCheckoutSchema = z.object({
  planKey: planKeySchema,
  interval: z.enum(["monthly", "annual"]),
});

function fieldErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details below and try again.";
}

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

  const parsedIdentity = identitySchema.safeParse({
    stateCode: formData.get("stateCode"),
    gstin: formData.get("gstin") ?? "",
  });
  if (!parsedIdentity.success) return { error: fieldErrorMessage(parsedIdentity.error) };

  try {
    const session =
      parsedPlan.data.interval === "annual"
        ? await startAnnualCheckout({
            businessId,
            userId,
            planKey: parsedPlan.data.planKey,
            identity: parsedIdentity.data,
          })
        : await startMonthlyCheckout({
            businessId,
            userId,
            planKey: parsedPlan.data.planKey,
            identity: parsedIdentity.data,
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
  return { success: true, notice: "Payment received." };
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

  const parsedIdentity = identitySchema.safeParse({
    stateCode: formData.get("stateCode"),
    gstin: formData.get("gstin") ?? "",
  });
  if (!parsedIdentity.success) return { error: fieldErrorMessage(parsedIdentity.error) };

  let result: PlanChangeResult;
  try {
    result = await changePlan({
      businessId,
      userId,
      toPlanKey: parsedPlan.data,
      identity: parsedIdentity.data,
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

/** Customers are India-only for v1, so dates are shown in IST. */
function formatIstDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
