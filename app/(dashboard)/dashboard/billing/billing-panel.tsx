"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useToast } from "../_components/toast";
import { INDIAN_STATES } from "@/lib/india-states";
import {
  cancelSubscriptionAction,
  changePlanAction,
  confirmOrderCheckoutAction,
  confirmSubscriptionCheckoutAction,
  startCheckoutAction,
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
 * **UPI AutoPay is offered, not just cards**, and that needs nothing in
 * this file: Razorpay Checkout shows every method enabled on the account
 * for a recurring mandate, so UPI appears once it is toggled on in the
 * dashboard (Subscriptions -> Settings). It is in range -- UPI AutoPay and
 * domestic cards both cap recurring charges at Rs 15,000, and the largest
 * plan here is Rs 9,999 a month. The annual plans are one-time orders, not
 * mandates, so that cap does not apply to them at all.
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
}: {
  configured: boolean;
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  identity: { stateCode: string | null; gstin: string | null };
  plans: PlanSummary[];
  gstRatePercent: number;
}) {
  const { toast } = useToast();
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
  const [, confirmSubscriptionAction] = useActionState<BillingActionState, FormData>(
    confirmSubscriptionCheckoutAction,
    {},
  );
  const [, confirmOrderAction] = useActionState<BillingActionState, FormData>(confirmOrderCheckoutAction, {});

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
        handler: (response: RazorpayCheckoutResponse) => {
          setCheckoutOpen(false);
          const formData = new FormData();
          if (session.kind === "subscription") {
            formData.set("paymentId", response.razorpay_payment_id ?? "");
            formData.set("signature", response.razorpay_signature ?? "");
            confirmSubscriptionAction(formData);
          } else {
            formData.set("orderId", session.orderId);
            formData.set("paymentId", response.razorpay_payment_id ?? "");
            formData.set("signature", response.razorpay_signature ?? "");
            formData.set("planKey", session.planKey);
            formData.set("purpose", session.purpose);
            confirmOrderAction(formData);
          }
          toast({ title: "Payment received. Updating your plan…", variant: "success" });
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
    [confirmOrderAction, confirmSubscriptionAction, toast],
  );

  // One effect per action state, so a session returned by either the
  // subscribe form or the change-plan form opens the sheet.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const session = startState.session ?? changeState.session;
    if (!session || !scriptReady) return;
    const token = session.kind === "subscription" ? session.subscriptionId : session.orderId;
    if (openedRef.current === token) return;
    openedRef.current = token;
    openCheckout(session);
  }, [startState.session, changeState.session, scriptReady, openCheckout]);

  useEffect(() => {
    for (const state of [startState, changeState, cancelState]) {
      if (state.error) toast({ title: state.error, variant: "error" });
      else if (state.notice) toast({ title: state.notice, variant: "success" });
    }
    // Toasting once per state transition is the intent; the action states
    // only change when an action returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startState, changeState, cancelState]);

  const percentUsed =
    usage.replyQuota > 0 ? Math.min(Math.round((usage.repliesUsed / usage.replyQuota) * 100), 100) : 0;

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

      <CurrentPlanCard entitlement={entitlement} usage={usage} percentUsed={percentUsed} />

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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ds-text-primary">
                State <span className="text-ds-text-muted">(required)</span>
              </span>
              <select
                name="stateCode"
                required
                defaultValue={identity.stateCode ?? ""}
                className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                <option value="">Select your state</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
              <span className="text-2xs text-ds-text-muted">
                Your place of supply. It decides how {gstRatePercent}% GST is shown on your invoice —
                CGST and SGST within your state, IGST outside it.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ds-text-primary">
                GSTIN <span className="text-ds-text-muted">(optional)</span>
              </span>
              <input
                type="text"
                name="gstin"
                maxLength={15}
                defaultValue={identity.gstin ?? ""}
                placeholder="22AAAAA0000A1Z5"
                autoComplete="off"
                className="rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 font-mono text-sm uppercase text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              />
              <span className="text-2xs text-ds-text-muted">
                Add it if your business is GST-registered and we will put it on your invoice so you can
                claim input credit.
              </span>
            </label>
          </div>

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
              Cards and UPI AutoPay. {entitlement.isTrial ? "You are not charged until your trial ends." : ""}
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
}: {
  entitlement: EntitlementSummary;
  usage: { repliesUsed: number; replyQuota: number; degraded: boolean };
  percentUsed: number;
}) {
  const statusLabel = describeStatus(entitlement);

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

      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact
          label="Replies this period"
          value={
            usage.degraded
              ? "Unavailable right now"
              : `${usage.repliesUsed.toLocaleString("en-IN")} of ${usage.replyQuota.toLocaleString("en-IN")}`
          }
        />
        <Fact
          label={entitlement.isTrial ? "Trial ends" : entitlement.cancelAtPeriodEnd ? "Access until" : "Next charge"}
          value={formatDate(entitlement.trialEndsAt ?? entitlement.periodEnd)}
        />
        <Fact
          label="Billing"
          value={
            entitlement.billingInterval === "annual"
              ? "Yearly, paid in advance"
              : entitlement.billingInterval === "monthly"
                ? "Monthly, automatic"
                : "Not set up yet"
          }
        />
      </dl>

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
    return `A payment did not go through${entitlement.pastDueSince ? ` on ${formatDate(entitlement.pastDueSince)}` : ""}. You keep full access while we retry — update your payment method to clear it.`;
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
