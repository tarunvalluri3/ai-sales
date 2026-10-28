"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useToast } from "../_components/toast";
import { BillingDetailsFields, type BillingIdentityValues } from "./billing-details";
import { GstBreakdown } from "./gst-breakdown";
import {
  cancelSubscriptionAction,
  changePlanAction,
  confirmOrderCheckoutAction,
  confirmSubscriptionCheckoutAction,
  startCheckoutAction,
  updatePaymentMethodAction,
  type BillingActionState,
} from "./actions";

/**
 * The minimal billing control surface (Phase 17b). Full billing is 17c.
 *
 * **It opens Razorpay Checkout and then hands the result straight back to
 * a Server Action.** The browser never sees an amount it could change --
 * it receives a `subscription_id` or an `order_id` that the server created
 * from `lib/plans.ts`, and Razorpay charges whatever that object says. The
 * callback's signature is verified server-side against the id *we* stored,
 * not the one Checkout handed back.
 *
 * **The callback is treated as UI.** If it never fires -- the customer
 * closes the tab, their connection drops -- the Razorpay webhook still
 * moves the subscription into the right state. That is why the "payment
 * sheet closed" path below simply refreshes instead of reporting a
 * failure: the honest answer is "we do not know yet, and we will".
 *
 * **Cards only** (decided 2026-10-21). Checkout is configured to show a
 * single "Pay via Card" block and hide every other method, so what the
 * customer is offered does not depend on which methods happen to be enabled
 * on the Razorpay account at the time. The Razorpay dashboard is still the
 * place the other methods are switched off at the source
 * (Subscriptions -> Settings): this client option is the belt, that is the
 * braces.
 *
 * The billing-details fields are the same component the "Billing details"
 * card uses, so a GST invoice is always made out to what the customer
 * confirmed at the moment they paid.
 */

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

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

type RazorpayCheckoutResponse = {
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayInstance = { open: () => void; on: (event: string, handler: (payload: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Customers are India-only for v1, so dates are shown in IST. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function BillingPanel({
  configured,
  entitlement,
  usage,
  identity,
  plans,
  gstRatePercent,
  supplierStateName,
  onConfirmingChange,
}: {
  configured: boolean;
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  identity: BillingIdentityValues;
  plans: PlanSummary[];
  gstRatePercent: number;
  supplierStateName: string;
  /** Lets a host (the onboarding plan step) hold its Continue button while the server verifies a payment. */
  onConfirmingChange?: (confirming: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "annual">(entitlement.billingInterval ?? "monthly");
  const [selectedPlan, setSelectedPlan] = useState(entitlement.planKey);
  const [scriptReady, setScriptReady] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const isSubscribed = entitlement.hasPaymentMethod && !entitlement.grandfathered;

  const [startState, startFormAction, startPending] = useActionState<BillingActionState, FormData>(
    startCheckoutAction,
    {},
  );
  const [changeState, changeFormAction, changePending] = useActionState<BillingActionState, FormData>(
    changePlanAction,
    {},
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState<BillingActionState, FormData>(
    cancelSubscriptionAction,
    {},
  );
  const [paymentMethodState, paymentMethodFormAction, paymentMethodPending] = useActionState<
    BillingActionState,
    FormData
  >(updatePaymentMethodAction, {});

  /**
   * Hands the Checkout result to the server and waits for the server's verdict
   * before saying anything is done. Razorpay's browser callback is only a
   * claim: the Server Action verifies its signature against the id WE stored,
   * and the plan, status and period still change only through the webhook.
   * The page is refreshed from the server afterwards, so what the customer
   * sees (and what the onboarding step's Continue is gated on) is server state.
   */
  const confirmOnServer = useCallback(
    async (run: () => Promise<BillingActionState>) => {
      setConfirming(true);
      onConfirmingChange?.(true);
      try {
        const result = await run();
        if (result.error) {
          toast({ title: result.error, variant: "error" });
        } else {
          toast({ title: result.notice ?? "Payment confirmed.", variant: "success" });
        }
      } catch {
        toast({
          title: "We could not confirm your payment yet. It may still be processing — refresh in a moment.",
          variant: "error",
        });
      } finally {
        setConfirming(false);
        onConfirmingChange?.(false);
        router.refresh();
      }
    },
    [onConfirmingChange, router, toast],
  );

  const openCheckout = useCallback(
    (session: NonNullable<BillingActionState["session"]>) => {
      if (!window.Razorpay) {
        toast({ title: "Payment window could not load. Please refresh and try again.", variant: "error" });
        return;
      }

      setCheckoutOpen(true);

      const options: Record<string, unknown> = {
        key: session.razorpayKeyId,
        name: "Waves AI Pilot",
        description:
          session.kind === "subscription"
            ? `${session.planName} plan`
            : session.purpose === "annual"
              ? `${session.planName} plan, one year`
              : `Upgrade to ${session.planName}`,
        ...(session.kind === "subscription"
          ? { subscription_id: session.subscriptionId }
          : { order_id: session.orderId }),
        notes: { plan: session.planKey },
        theme: { color: "#17150f" },
        // Cards only: one block that lists only the card method, with the
        // default blocks (UPI, netbanking, wallets...) switched off.
        config: {
          display: {
            blocks: { cards_only: { name: "Pay via card", instruments: [{ method: "card" }] } },
            sequence: ["block.cards_only"],
            preferences: { show_default_blocks: false },
          },
        },
        handler: (response: RazorpayCheckoutResponse) => {
          setCheckoutOpen(false);
          const formData = new FormData();
          if (session.kind === "subscription") {
            formData.set("paymentId", response.razorpay_payment_id ?? "");
            formData.set("signature", response.razorpay_signature ?? "");
            void confirmOnServer(() => confirmSubscriptionCheckoutAction({}, formData));
          } else {
            formData.set("orderId", session.orderId);
            formData.set("paymentId", response.razorpay_payment_id ?? "");
            formData.set("signature", response.razorpay_signature ?? "");
            formData.set("planKey", session.planKey);
            formData.set("purpose", session.purpose);
            void confirmOnServer(() => confirmOrderCheckoutAction({}, formData));
          }
          toast({ title: "Confirming your payment…", variant: "info" });
        },
        modal: {
          ondismiss: () => {
            setCheckoutOpen(false);
            // Not reported as a failure. The customer may genuinely have
            // abandoned it -- or the payment may be mid-flight, in which
            // case the webhook will land and the page will be right the
            // next time it loads. Claiming either outcome would be a guess.
            toast({ title: "Payment window closed. Nothing has been charged yet.", variant: "info" });
          },
        },
      };

      new window.Razorpay(options).open();
    },
    [confirmOnServer, toast],
  );

  // One effect per action state, so a session returned by either the
  // subscribe form or the change-plan form opens the sheet.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const session = startState.session ?? changeState.session ?? paymentMethodState.session;
    if (!session || !scriptReady) return;
    const token = session.kind === "subscription" ? session.subscriptionId : session.orderId;
    if (openedRef.current === token) return;
    openedRef.current = token;
    openCheckout(session);
  }, [startState.session, changeState.session, paymentMethodState.session, scriptReady, openCheckout]);

  useEffect(() => {
    for (const state of [startState, changeState, cancelState, paymentMethodState]) {
      if (state.error) toast({ title: state.error, variant: "error" });
      else if (state.notice) toast({ title: state.notice, variant: "success" });
    }
    // Toasting once per state transition is the intent; the action states
    // only change when an action returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startState, changeState, cancelState, paymentMethodState]);

  const percentUsed =
    usage.replyQuota > 0 ? Math.min(Math.round((usage.repliesUsed / usage.replyQuota) * 100), 100) : 0;

  // What the next charge will be: the current plan at the current interval
  // (config prices, GST-inclusive). Null when nothing will renew.
  const currentPlanSummary = plans.find((p) => p.key === entitlement.planKey);
  const nextChargePaise =
    currentPlanSummary &&
    isSubscribed &&
    !entitlement.cancelAtPeriodEnd &&
    entitlement.billingInterval !== null &&
    entitlement.status !== "expired" &&
    entitlement.status !== "cancelled"
      ? entitlement.billingInterval === "annual"
        ? currentPlanSummary.annualPricePaise
        : currentPlanSummary.monthlyPricePaise
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Razorpay's Checkout script, loaded only on this page rather than
          across the whole dashboard: it is a third-party script that most
          visits never need. `onReady` rather than `onLoad` because it also
          fires when the script is already cached from a previous visit to
          this page, which a load event would not. */}
      {configured ? (
        <Script
          src={RAZORPAY_CHECKOUT_SRC}
          strategy="lazyOnload"
          onReady={() => setScriptReady(true)}
          onError={() =>
            toast({
              title: "The payment window could not load. Please refresh and try again.",
              variant: "error",
            })
          }
        />
      ) : null}

      {confirming ? (
        <p role="status" className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text-secondary">
          Confirming your payment with our server… this usually takes a few seconds.
        </p>
      ) : null}

      <CurrentPlanCard
        entitlement={entitlement}
        usage={usage}
        percentUsed={percentUsed}
        nextChargePaise={nextChargePaise}
        gstRatePercent={gstRatePercent}
        updatePaymentMethod={{
          action: paymentMethodFormAction,
          pending: paymentMethodPending || confirming || checkoutOpen,
          ready: configured && scriptReady,
        }}
      />

      <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ds-text-primary">
            {isSubscribed ? "Change your plan" : "Choose a plan"}
          </h2>
          <p className="text-sm text-ds-text-secondary">
            Upgrades take effect straight away and you pay only the difference for the rest of your
            period. Downgrades take effect at your next renewal, so you keep what you have paid for.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ds-text-primary">Billing period</legend>
          <div className="flex gap-2">
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                aria-pressed={interval === value}
                className={`rounded-ds-sm border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                  interval === value
                    ? "border-ds-accent bg-ds-accent-soft-bg text-ds-text-primary"
                    : "border-ds-border text-ds-text-secondary hover:border-ds-border-strong"
                }`}
              >
                {value === "monthly" ? "Monthly" : "Yearly — two months free"}
              </button>
            ))}
          </div>
        </fieldset>

        <ul className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const selected = selectedPlan === plan.key;
            const current = entitlement.planKey === plan.key;
            const pricePaise = interval === "annual" ? plan.annualPricePaise : plan.monthlyPricePaise;
            return (
              <li key={plan.key}>
                <button
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  aria-pressed={selected}
                  className={`flex w-full flex-col gap-1 rounded-ds-md border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                    selected
                      ? "border-ds-accent bg-ds-accent-soft-bg"
                      : "border-ds-border bg-ds-bg hover:border-ds-border-strong"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ds-text-primary">{plan.name}</span>
                    {current ? (
                      <span className="rounded-ds-sm bg-ds-surface-elevated px-2 py-0.5 text-2xs font-semibold text-ds-text-secondary">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <span className="text-lg font-semibold text-ds-text-primary">
                    {formatInr(pricePaise)}
                    <span className="text-2xs font-normal text-ds-text-muted">
                      {" "}
                      / {interval === "annual" ? "year" : "month"}, incl. GST
                    </span>
                  </span>
                  <GstBreakdown grossPaise={pricePaise} gstRatePercent={gstRatePercent} />
                  <span className="text-2xs text-ds-text-secondary">
                    {plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies / month ·{" "}
                    {plan.seatsLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <form action={isSubscribed ? changeFormAction : startFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="planKey" value={selectedPlan} />
          <input type="hidden" name="interval" value={interval} />

          <BillingDetailsFields
            defaults={identity}
            gstRatePercent={gstRatePercent}
            supplierStateName={supplierStateName}
            idPrefix="checkout"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={
                !configured ||
                !scriptReady ||
                startPending ||
                changePending ||
                checkoutOpen ||
                (selectedPlan === entitlement.planKey && isSubscribed && interval === entitlement.billingInterval)
              }
              className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {startPending || changePending
                ? "Opening payment…"
                : isSubscribed
                  ? `Move to ${plans.find((p) => p.key === selectedPlan)?.name ?? "plan"}`
                  : "Continue to payment"}
            </button>
            {configured && !scriptReady ? (
              <span className="text-2xs text-ds-text-muted">Loading the payment window…</span>
            ) : null}
            <span className="text-2xs text-ds-text-muted">
              Cards only. {entitlement.isTrial ? "You are not charged until your trial ends." : ""}
            </span>
          </div>
        </form>
      </section>

      {isSubscribed && !entitlement.cancelAtPeriodEnd ? (
        <CancelCard
          action={cancelFormAction}
          pending={cancelPending}
          accessUntil={entitlement.periodEnd}
          error={cancelState.error}
        />
      ) : null}
    </div>
  );
}

function CurrentPlanCard({
  entitlement,
  usage,
  percentUsed,
  nextChargePaise,
  gstRatePercent,
  updatePaymentMethod,
}: {
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  percentUsed: number;
  nextChargePaise: number | null;
  gstRatePercent: number;
  updatePaymentMethod: { action: (formData: FormData) => void; pending: boolean; ready: boolean };
}) {
  const statusLabel = describeStatus(entitlement);
  // Re-authorising is the fix only for a mandate that is failing (past_due);
  // an expired plan goes through "Choose a plan" below. A healthy mandate's
  // card cannot be swapped self-serve yet (see updatePaymentMethodAction).
  const canUpdatePaymentMethod = entitlement.status === "past_due" && entitlement.billingInterval === "monthly";

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ds-text-muted">
            Current plan
          </p>
          <h2 className="text-lg font-semibold text-ds-text-primary">{entitlement.planName}</h2>
          <p className="text-sm text-ds-text-secondary">{statusLabel}</p>
        </div>
        {!entitlement.serving ? (
          <span className="rounded-ds-sm border border-ds-danger bg-ds-danger-bg px-3 py-1 text-2xs font-semibold text-ds-text-primary">
            AI replies paused
          </span>
        ) : null}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Replies this period"
          value={
            usage.degraded
              ? "Unavailable right now"
              : `${usage.repliesUsed.toLocaleString("en-IN")} of ${usage.replyQuota.toLocaleString("en-IN")}`
          }
        />
        <Fact
          label={entitlement.isTrial ? "Trial ends" : entitlement.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
          value={formatDate(entitlement.trialEndsAt ?? entitlement.periodEnd)}
        />
        <div className="flex flex-col gap-0.5">
          <dt className="text-2xs font-medium uppercase tracking-wide text-ds-text-muted">Amount</dt>
          <dd className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-ds-text-primary">
              {nextChargePaise !== null ? formatInr(nextChargePaise) : "Nothing due"}
            </span>
            {nextChargePaise !== null ? (
              <GstBreakdown grossPaise={nextChargePaise} gstRatePercent={gstRatePercent} />
            ) : null}
          </dd>
        </div>
        <Fact
          label="Payment method"
          value={
            entitlement.grandfathered || !entitlement.hasPaymentMethod
              ? "None on file"
              : entitlement.billingInterval === "annual"
                ? "Card, paid for the year"
                : "Card, charged automatically"
          }
        />
      </dl>

      {canUpdatePaymentMethod ? (
        <form action={updatePaymentMethod.action} className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={updatePaymentMethod.pending || !updatePaymentMethod.ready}
            className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {updatePaymentMethod.pending ? "Opening payment…" : "Update payment method"}
          </button>
          <span className="text-2xs text-ds-text-muted">
            Authorise a card again and we retry the payment straight away.
          </span>
        </form>
      ) : null}

      {!usage.degraded && usage.replyQuota > 0 ? (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-valuenow={percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI replies used this period"
            className="h-2 w-full overflow-hidden rounded-full bg-ds-surface-elevated"
          >
            <div
              className={`h-full rounded-full ${percentUsed >= 100 ? "bg-ds-danger" : "bg-ds-accent"}`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <p className="text-2xs text-ds-text-muted">{percentUsed}% of this period&apos;s AI replies used</p>
        </div>
      ) : null}

      {entitlement.scheduledPlanKey ? (
        <p className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-secondary">
          Scheduled: moving to the {entitlement.scheduledPlanKey} plan on{" "}
          {formatDate(entitlement.periodEnd)}. Nothing changes before then.
        </p>
      ) : null}

      {entitlement.grandfathered ? (
        <p className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-secondary">
          You have been with us since before we introduced plans, so you are on Scale-level
          entitlements at no charge. Nothing changes until you choose a plan yourself.
        </p>
      ) : null}
    </section>
  );
}

function describeStatus(entitlement: EntitlementSummary): string {
  if (entitlement.isTrial) {
    return entitlement.hasPaymentMethod
      ? `Free trial. Your plan starts automatically when it ends on ${formatDate(entitlement.periodEnd)}.`
      : `Free trial, with no payment method yet. It will stop on ${formatDate(entitlement.periodEnd)} unless you choose a plan.`;
  }
  if (entitlement.status === "past_due") {
    const failed = entitlement.pastDueSince ? ` on ${formatDate(entitlement.pastDueSince)}` : "";
    return entitlement.serving && entitlement.graceUntil
      ? `A payment did not go through${failed}. Your agent stays live until ${formatDate(entitlement.graceUntil)} while we retry — update your payment method to clear it.`
      : `A payment did not go through${failed} and the grace period has ended, so your agent is paused. Update your payment method to bring it back.`;
  }
  if (entitlement.status === "cancelled") {
    return `Cancelled. You keep full access until ${formatDate(entitlement.periodEnd)}.`;
  }
  if (entitlement.status === "expired") {
    return "This plan has ended, so your AI is not replying to prospects. Choose a plan to switch it back on.";
  }
  if (entitlement.cancelAtPeriodEnd) {
    return `Nothing will renew. You keep full access until ${formatDate(entitlement.periodEnd)} — subscribe again before then to continue without a gap.`;
  }
  return `Active, renewing on ${formatDate(entitlement.periodEnd)}.`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-2xs font-medium uppercase tracking-wide text-ds-text-muted">{label}</dt>
      <dd className="text-sm font-medium text-ds-text-primary">{value}</dd>
    </div>
  );
}

/**
 * Cancellation, behind a type-to-confirm. Cancelling stops a live sales
 * channel at the end of the period, so a mis-click should not be enough --
 * the same shape /dashboard/profile's business deletion uses.
 */
function CancelCard({
  action,
  pending,
  accessUntil,
  error,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  accessUntil: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ds-text-primary">Cancel your plan</h2>
        <p className="text-sm text-ds-text-secondary">
          You keep everything until {formatDate(accessUntil)}, the end of the period you have already
          paid for. After that your AI stops replying and prospects are told a person will follow up.
          Your data stays where it is. Fees already paid are not refundable.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-ds-sm border border-ds-border-strong px-4 py-2 text-sm font-medium text-ds-text-primary transition-colors hover:border-ds-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Cancel at period end
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {error ? (
            <p
              role="alert"
              className="rounded-ds-sm border border-ds-danger bg-ds-danger-bg px-3 py-2 text-sm text-ds-text-primary"
            >
              {error}
            </p>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ds-text-primary">
              Type CANCEL to confirm
            </span>
            <input
              type="text"
              name="confirm"
              autoComplete="off"
              required
              className="max-w-xs rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ds-sm border border-ds-danger bg-ds-danger-bg px-4 py-2 text-sm font-semibold text-ds-text-primary transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {pending ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-ds-sm px-4 py-2 text-sm font-medium text-ds-text-secondary hover:text-ds-text-primary"
            >
              Keep my plan
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
