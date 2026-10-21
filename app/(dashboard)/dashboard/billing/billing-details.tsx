"use client";

import { useActionState, useEffect } from "react";
import { useToast } from "../_components/toast";
import { INDIAN_STATES } from "@/lib/india-states";
import { updateBillingDetailsAction, type BillingActionState } from "./actions";

/**
 * The customer's billing identity: the name, address, state and GSTIN
 * printed on every GST tax invoice (Phase 17c).
 *
 * **Changes apply to FUTURE invoices only** -- and the page says so, in
 * words, next to the form. An issued invoice is a snapshot held in an
 * immutable table, so renaming the business or moving state here can never
 * alter a document that already exists; what it changes is the next one.
 *
 * `BillingDetailsFields` is shared with the checkout form in
 * billing-panel.tsx, so the two can never disagree about what is asked for
 * or how it is labelled. All validation is server-side
 * (lib/billing-identity.ts): the `required`/`maxLength` attributes here are
 * a courtesy to the keyboard user, not a control.
 */

export type BillingIdentityValues = {
  name: string;
  address: string;
  stateCode: string;
  gstin: string;
};

const fieldClass =
  "rounded-ds-sm border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

export function BillingDetailsFields({
  defaults,
  gstRatePercent,
  supplierStateName,
  idPrefix,
}: {
  defaults: BillingIdentityValues;
  gstRatePercent: number;
  supplierStateName: string;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium text-ds-text-primary">
          Billing name <span className="text-ds-text-muted">(required)</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          name="billingName"
          required
          maxLength={200}
          defaultValue={defaults.name}
          autoComplete="organization"
          aria-describedby={`${idPrefix}-name-help`}
          className={fieldClass}
        />
        <span id={`${idPrefix}-name-help`} className="text-2xs text-ds-text-muted">
          Exactly as it should appear on your invoice: your registered business name, if you have one.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-state`} className="text-sm font-medium text-ds-text-primary">
          State <span className="text-ds-text-muted">(required)</span>
        </label>
        <select
          id={`${idPrefix}-state`}
          name="stateCode"
          required
          defaultValue={defaults.stateCode}
          aria-describedby={`${idPrefix}-state-help`}
          className={fieldClass}
        >
          <option value="">Select your state</option>
          {INDIAN_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
        <span id={`${idPrefix}-state-help`} className="text-2xs text-ds-text-muted">
          Your place of supply. It decides how {gstRatePercent}% GST is shown on your invoice — CGST and
          SGST if you are in {supplierStateName}, IGST for any other state.
        </span>
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <label htmlFor={`${idPrefix}-address`} className="text-sm font-medium text-ds-text-primary">
          Billing address <span className="text-ds-text-muted">(required)</span>
        </label>
        <textarea
          id={`${idPrefix}-address`}
          name="billingAddress"
          required
          rows={3}
          maxLength={600}
          defaultValue={defaults.address}
          autoComplete="street-address"
          aria-describedby={`${idPrefix}-address-help`}
          className={fieldClass}
        />
        <span id={`${idPrefix}-address-help`} className="text-2xs text-ds-text-muted">
          Street, area, city and PIN code. Use English letters — it is printed on a tax invoice that
          cannot be edited afterwards.
        </span>
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <label htmlFor={`${idPrefix}-gstin`} className="text-sm font-medium text-ds-text-primary">
          GSTIN <span className="text-ds-text-muted">(optional)</span>
        </label>
        <input
          id={`${idPrefix}-gstin`}
          type="text"
          name="gstin"
          maxLength={15}
          defaultValue={defaults.gstin}
          placeholder="29ABCDE1234F1ZW"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${idPrefix}-gstin-help`}
          className={`${fieldClass} max-w-xs font-mono uppercase`}
        />
        <span id={`${idPrefix}-gstin-help`} className="text-2xs text-ds-text-muted">
          If your business is GST-registered, add it and we will print it on your invoice so you can
          claim input tax credit. We check it is valid and belongs to the state you selected.
        </span>
      </div>
    </div>
  );
}

export function BillingDetailsCard({
  defaults,
  gstRatePercent,
  supplierStateName,
  hasHeldInvoice,
}: {
  defaults: BillingIdentityValues;
  gstRatePercent: number;
  supplierStateName: string;
  hasHeldInvoice: boolean;
}) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(
    updateBillingDetailsAction,
    {},
  );

  useEffect(() => {
    if (state.notice) toast({ title: state.notice, variant: "success" });
    // A toast per returned state is the intent; the state only changes when
    // the action returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <section
      id="billing-details"
      aria-labelledby="billing-details-heading"
      className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="billing-details-heading" className="text-base font-semibold text-ds-text-primary">
          Billing details
        </h2>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          This is who your GST tax invoices are made out to.{" "}
          <strong className="font-semibold text-ds-text-primary">
            Changes apply to future invoices only
          </strong>{" "}
          — an invoice we have already issued is a legal record and is never altered.
        </p>
        {hasHeldInvoice ? (
          <p className="text-sm font-medium text-ds-text-primary">
            Saving these will issue the invoice that is waiting on them.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <p
            role="alert"
            className="rounded-ds-sm border border-ds-danger bg-ds-danger-bg px-3 py-2 text-sm text-ds-text-primary"
          >
            {state.error}
          </p>
        ) : null}

        <BillingDetailsFields
          defaults={defaults}
          gstRatePercent={gstRatePercent}
          supplierStateName={supplierStateName}
          idPrefix="details"
        />

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {pending ? "Saving…" : "Save billing details"}
          </button>
        </div>
      </form>
    </section>
  );
}
