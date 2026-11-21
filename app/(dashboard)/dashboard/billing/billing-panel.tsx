"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { AlertTriangle } from "lucide-react";
import { useToast } from "../_components/toast";
import { BILLING_TIME_ZONE, formatDate as formatBusinessDate } from "@/lib/format-business-time";
import { BillingDetailsFields, type BillingIdentityValues } from "./billing-details";
import { GstBreakdown } from "./gst-breakdown";
import { TRIAL_NOT_AVAILABLE_MESSAGE } from "@/lib/trial-messages";
import {
  planChannelsLabel,
  starterChannelLossWarning,
  trialVsStarterNote,
  type ConnectedMetaChannels,
} from "@/lib/plan-channel-copy";
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
  return formatBusinessDate(iso, BILLING_TIME_ZONE);
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
  metaChannelNames,
  connectedChannels,
  aside,
  compactPlans,
  savedDetails,
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
  /** Launched Meta channels, e.g. "WhatsApp and Instagram" (lib/plan-channel-copy.ts); null = none launched. */
  metaChannelNames: string | null;
  /** WhatsApp / Instagram connected right now, for the "you'd lose it on Starter" warning. */
  connectedChannels: ConnectedMetaChannels;
  /** Optional card rendered beside the current-plan card (the Billing page's "Invoice details" summary). */
  aside?: ReactNode;
  compactPlans?: boolean;
  /**
   * Billing page: the ONE billing-details form is the card below the plans, so
   * checkout does not repeat the fields. Pass the saved summary (null when
   * nothing is on file yet, which blocks checkout until it is). Omit it (the
   * onboarding plan step) and the fields render inline as before.
   */
  savedDetails?: { stateName: string | null; complete: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "annual">(entitlement.billingInterval ?? "monthly");
  const [selectedPlan, setSelectedPlan] = useState(entitlement.planKey);
  // Round 3, item 3: picking Starter with WhatsApp/Instagram connected needs
  // an explicit "I understand" first. Reset whenever the selection changes.
  const [starterLossAcknowledged, setStarterLossAcknowledged] = useState(false);
  const starterWarning = starterChannelLossWarning(selectedPlan, connectedChannels);
  const trialNote = entitlement.isTrial ? trialVsStarterNote(metaChannelNames) : null;
  const [scriptReady, setScriptReady] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const isSubscribed = entitlement.hasPaymentMethod && !entitlement.noSubscription;

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
        theme: { color: "#111110" },
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
    <div className="@container flex flex-col gap-4">
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
        <p role="status" className="rounded-2xl bg-ds-success-bg px-4 py-3 text-sm text-ds-success">
          Confirming your payment with our server… this usually takes a few seconds.
        </p>
      ) : null}

      <div className={aside ? "grid grid-cols-1 items-stretch gap-4 @5xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : undefined}>
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
        {aside}
      </div>

      <section className="dx-card flex flex-col gap-4 dx-card-pad">
        <div className="flex flex-col gap-1">
          <h2 className="dx-title">{isSubscribed ? "Choose your plan" : "Choose a plan"}</h2>
          <p className="dx-subtitle">
            Upgrades take effect straight away and you pay only the difference for the rest of your
            period. Downgrades take effect at your next renewal, so you keep what you have paid for.
          </p>
          {trialNote ? <p className="text-sm font-medium text-ds-text-primary">{trialNote}</p> : null}
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Billing period</legend>
          <div className="inline-flex w-fit gap-1 rounded-full border border-ds-border-strong bg-ds-surface p-1">
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                aria-pressed={interval === value}
                className={`dx-pill inline-flex h-10 items-center gap-2 px-6 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary ${
                  interval === value ? "bg-ds-primary text-ds-primary-on" : "text-ds-text-primary hover:bg-ds-surface-soft"
                }`}
              >
                {value === "monthly" ? "Monthly" : "Yearly"}
                {value === "annual" ? (
                  <span
                    className={`dx-pill px-2.5 py-0.5 text-xs font-medium ${
                      interval === value ? "bg-ds-primary-on/20 text-ds-primary-on" : "bg-ds-primary/10 text-ds-primary"
                    }`}
                  >
                    Two months free
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>

        <ul className={compactPlans ? "grid gap-3 @min-[42rem]:grid-cols-3" : "grid gap-3 md:grid-cols-3"}>
          {plans.map((plan) => {
            const selected = selectedPlan === plan.key;
            const current = entitlement.planKey === plan.key;
            const pricePaise = interval === "annual" ? plan.annualPricePaise : plan.monthlyPricePaise;
            return (
              <li key={plan.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlan(plan.key);
                    setStarterLossAcknowledged(false);
                  }}
                  aria-pressed={selected}
                  className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border-2 p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary ${
                    selected ? "border-ds-lime bg-ds-lime-soft" : "border-ds-border bg-ds-surface hover:border-ds-border-strong"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ds-text-primary">{plan.name}</span>
                    {current ? (
                      <span className="dx-pill bg-ds-primary/10 px-3 py-0.5 text-sm font-medium text-ds-primary">Current</span>
                    ) : null}
                  </span>
                  <span className="text-base font-medium text-ds-text-primary">
                    {formatInr(pricePaise)}
                    <span className="text-sm font-normal text-ds-text-secondary">
                      {" "}
                      / {interval === "annual" ? "year" : "month"}, incl. GST
                    </span>
                  </span>
                  <span className="text-sm text-ds-text-primary">
                    {plan.monthlyReplyQuota.toLocaleString("en-IN")} AI replies / month ·{" "}
                    {plan.seatsLabel}
                  </span>
                  <span className="text-sm text-ds-text-secondary">{planChannelsLabel(plan.key, metaChannelNames)}</span>
                  <GstBreakdown
                    grossPaise={pricePaise}
                    gstRatePercent={gstRatePercent}
                    className="mt-auto border-t border-ds-border pt-2 text-sm text-ds-text-primary"
                  />
                  <span
                    className={`dx-pill mt-1 inline-flex h-9 items-center justify-center px-4 text-sm font-medium ${
                      selected ? "bg-ds-primary text-ds-primary-on" : "border border-ds-primary text-ds-primary"
                    }`}
                  >
                    {selected ? "Selected" : `Select ${plan.name}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <form action={isSubscribed ? changeFormAction : startFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="planKey" value={selectedPlan} />
          <input type="hidden" name="interval" value={interval} />

          {savedDetails ? (
            savedDetails.complete ? (
              <>
                <input type="hidden" name="billingName" value={identity.name} />
                <input type="hidden" name="billingAddress" value={identity.address} />
                <input type="hidden" name="stateCode" value={identity.stateCode} />
                <input type="hidden" name="gstin" value={identity.gstin} />
                <p className="text-sm text-ds-text-secondary">
                  Invoice to{" "}
                  <span className="font-medium text-ds-text-primary">
                    {identity.name}
                    {savedDetails.stateName ? `, ${savedDetails.stateName}` : ""}
                  </span>
                  .{" "}
                  <a href="#billing-details" className="font-medium text-ds-primary underline underline-offset-4">
                    Edit billing details
                  </a>
                </p>
              </>
            ) : (
              <p role="status" className="flex items-start gap-2 rounded-2xl bg-ds-warning-bg p-4 text-sm text-ds-text-primary">
                <AlertTriangle strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
                <span>
                  Add your billing details first. They go on your GST invoice.{" "}
                  <a href="#billing-details" className="font-medium text-ds-primary underline underline-offset-4">
                    Go to billing details
                  </a>
                </span>
              </p>
            )
          ) : (
            <BillingDetailsFields
              defaults={identity}
              gstRatePercent={gstRatePercent}
              supplierStateName={supplierStateName}
              idPrefix="checkout"
            />
          )}

          {starterWarning ? (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-ds-warning-bg p-4">
              <p className="flex items-start gap-2 text-sm text-ds-text-primary">
                <AlertTriangle strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
                <span>{starterWarning}</span>
              </p>
              <label className="flex items-start gap-2 text-sm text-ds-text-primary">
                <input
                  type="checkbox"
                  checked={starterLossAcknowledged}
                  onChange={(event) => setStarterLossAcknowledged(event.target.checked)}
                  className="mt-0.5 size-4 accent-ds-accent"
                />
                <span>I understand and still want Starter.</span>
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={
                !configured ||
                !scriptReady ||
                startPending ||
                changePending ||
                checkoutOpen ||
                (savedDetails !== undefined && !savedDetails.complete) ||
                (starterWarning !== null && !starterLossAcknowledged) ||
                (selectedPlan === entitlement.planKey && isSubscribed && interval === entitlement.billingInterval)
              }
              className="ds-btn-label inline-flex h-9 items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary min-w-56"
            >
              {startPending || changePending
                ? "Opening payment…"
                : isSubscribed
                  ? `Move to ${plans.find((p) => p.key === selectedPlan)?.name ?? "plan"}`
                  : "Continue to payment"}
            </button>
            {configured && !scriptReady ? (
              <span className="text-sm text-ds-text-secondary">Loading the payment window…</span>
            ) : null}
            <span className="text-sm text-ds-text-secondary">
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

  const isHealthy = entitlement.serving && entitlement.status !== "past_due";

  return (
    <section className="dx-card flex h-full flex-col gap-4 dx-card-pad">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ds-text-primary">Current plan</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg leading-none font-medium text-ds-text-primary">{entitlement.planName}</h2>
            <span
              className={`dx-pill px-3 py-1 text-sm font-medium ${
                !entitlement.serving
                  ? "bg-ds-danger-bg text-ds-danger"
                  : isHealthy
                    ? "bg-ds-primary text-ds-primary-on"
                    : "bg-ds-warning-bg text-ds-warning"
              }`}
            >
              {!entitlement.serving ? "AI replies paused" : entitlement.isTrial ? "Trial" : isHealthy ? "Active" : "Payment due"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 sm:border-l sm:border-ds-border sm:pl-6">
          <p className="text-lg leading-tight font-medium text-ds-text-primary">
            {nextChargePaise !== null ? formatInr(nextChargePaise) : "Nothing due"}
            {nextChargePaise !== null ? (
              <span className="text-base font-medium"> / {entitlement.billingInterval === "annual" ? "year" : "month"}</span>
            ) : null}
          </p>
          {nextChargePaise !== null ? (
            <GstBreakdown grossPaise={nextChargePaise} gstRatePercent={gstRatePercent} className="text-sm" />
          ) : null}
        </div>
      </div>

      <p className="text-sm text-ds-text-secondary">{statusLabel}</p>

      <div className="flex flex-col gap-2">
        <p className="flex items-center justify-between gap-3 text-sm text-ds-text-primary">
          <span>
            {usage.degraded ? (
              "Reply usage is unavailable right now"
            ) : (
              <>
                <span className="font-medium">{usage.repliesUsed.toLocaleString("en-IN")}</span> /{" "}
                {usage.replyQuota.toLocaleString("en-IN")} AI replies used
              </>
            )}
          </span>
          {!usage.degraded && usage.replyQuota > 0 ? <span className="font-medium">{percentUsed}%</span> : null}
        </p>
        {!usage.degraded && usage.replyQuota > 0 ? (
          <div
            role="progressbar"
            aria-valuenow={percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI replies used this period"
            className="dx-track h-3"
          >
            <span className={percentUsed >= 100 ? "bg-ds-danger" : ""} style={{ width: `${percentUsed}%` }} />
          </div>
        ) : null}
      </div>

      <dl className="mt-auto flex flex-wrap items-center gap-x-8 gap-y-3">
        <Fact
          label={entitlement.isTrial ? "Trial ends" : entitlement.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
          value={formatDate(entitlement.trialEndsAt ?? entitlement.periodEnd)}
        />
        <Fact
          label="Payment method"
          value={
            entitlement.noSubscription || !entitlement.hasPaymentMethod
              ? "None on file"
              : entitlement.billingInterval === "annual"
                ? "Card, paid for the year"
                : "Card, charged automatically"
          }
        />
        {canUpdatePaymentMethod ? (
          <form action={updatePaymentMethod.action} className="flex flex-col gap-1">
            <button
              type="submit"
              disabled={updatePaymentMethod.pending || !updatePaymentMethod.ready}
              className="ds-btn-label inline-flex h-10 items-center justify-center rounded-xl border border-ds-primary bg-ds-surface px-4 text-sm text-ds-primary transition-colors hover:bg-ds-surface-soft disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              {updatePaymentMethod.pending ? "Opening payment…" : "Update payment method"}
            </button>
            <span className="text-xs text-ds-text-secondary">Authorise a card again and we retry the payment straight away.</span>
          </form>
        ) : null}
      </dl>

      {entitlement.scheduledPlanKey ? (
        <p className="rounded-xl bg-ds-surface-soft px-4 py-2.5 text-sm text-ds-text-primary">
          Scheduled: moving to the {entitlement.scheduledPlanKey} plan on{" "}
          {formatDate(entitlement.periodEnd)}. Nothing changes before then.
        </p>
      ) : null}

      {entitlement.noSubscription ? (
        <p className="rounded-xl bg-ds-surface-soft px-4 py-2.5 text-sm text-ds-text-primary">
          {entitlement.notServingReason === "subscription_unavailable"
            ? "We could not load your plan just now, so AI replies are paused. Please refresh in a minute — if this continues, contact support."
            : "There is no plan on this account, so your AI is not replying to prospects. Choose a plan below to switch it on."}
        </p>
      ) : null}
    </section>
  );
}

function describeStatus(entitlement: EntitlementSummary): string {
  if (entitlement.isTrial) {
    if (!entitlement.serving) {
      return "Your free trial has ended, so your AI is not replying to prospects. Choose a plan to switch it back on.";
    }
    return entitlement.hasPaymentMethod
      ? `Free trial. Your plan starts automatically when it ends on ${formatDate(entitlement.periodEnd)}.`
      : `Free trial — no card needed. It stops on ${formatDate(entitlement.periodEnd)}, or sooner if you use all your trial replies, unless you choose a plan.`;
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
  if (entitlement.notServingReason === "trial_already_used") {
    return `${TRIAL_NOT_AVAILABLE_MESSAGE} Until then your AI is not replying to prospects.`;
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
    <div className="flex flex-col">
      <dt className="text-sm text-ds-text-secondary">{label}</dt>
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
    <section className="dx-card flex flex-col gap-3 dx-card-pad">
      <div className="flex flex-col gap-1">
        <h2 className="dx-title text-base">Cancel your plan</h2>
        <p className="dx-subtitle">
          You keep everything until {formatDate(accessUntil)}, the end of the period you have already
          paid for. After that your AI stops replying and prospects are told a person will follow up.
          Your data stays where it is. Fees already paid are not refundable.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ds-btn-label inline-flex h-10 items-center self-start rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-sm text-ds-text-primary transition-colors hover:border-ds-danger hover:text-ds-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          Cancel at period end
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
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
              className="h-10 max-w-xs rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 text-sm text-ds-text-primary"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="ds-btn-label inline-flex h-10 items-center rounded-xl bg-ds-danger px-4 text-sm text-ds-danger-on transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
            >
              {pending ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary"
            >
              Keep my plan
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
