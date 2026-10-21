import type { PlanKey } from "@/lib/plans";
import {
  CREDIT_NOTE_REASONS,
  NOTHING_CREDITED,
  buildCreditNoteDraft,
  buildInvoiceDraft,
  computeCreditNoteAmounts,
  resolveInvoiceCustomer,
  type CreditNoteDraft,
  type CreditNoteReason,
  type CreditNoteRow,
  type CreditedSoFar,
  type CustomerBillingDetails,
  type InvoiceDraft,
  type InvoiceRow,
  type PaymentForInvoice,
  InvoiceBuildError,
} from "@/lib/invoice-core";
import { supplierConfigProblems, type SupplierConfig } from "@/lib/invoice-config";

/**
 * Issuing an invoice or a credit note: the decisions, with the I/O handed
 * in (Phase 17c). Pure and NOT "server-only", so
 * scripts/run-invoice-tests.mjs runs it against an in-memory store that
 * mimics the database's counter and unique keys -- including the
 * "replay the same payment twice, get one invoice" test.
 *
 * Sibling of lib/razorpay-webhook.ts and built the same way, for the same
 * reason: the part that matters (never issue a wrong or duplicate legal
 * document) must be testable without a database.
 */

export type HoldReason =
  | "missing_customer_details"
  | "invalid_customer_details"
  | "supplier_config_incomplete"
  | "issue_failed";

/**
 * Thrown by `deps.issue` when the database REFUSED the document (a
 * constraint or a data error) -- something retrying cannot fix. Distinct
 * from a transient failure, which is thrown as an ordinary error so the
 * webhook answers non-2xx and Razorpay retries.
 */
export class DocumentRejectedError extends Error {}

/** A payment owed an invoice that cannot be issued yet. Rebuilds the `PaymentForInvoice`. */
export type InvoiceHold = {
  paymentId: string;
  businessId: string;
  reason: HoldReason;
  detail: string | null;
  amountPaise: number;
  currency: string;
  purpose: PaymentForInvoice["purpose"];
  planKey: PlanKey;
  orderId: string | null;
  subscriptionId: string | null;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
};

export function holdToPayment(hold: InvoiceHold): PaymentForInvoice {
  return {
    businessId: hold.businessId,
    paymentId: hold.paymentId,
    orderId: hold.orderId,
    subscriptionId: hold.subscriptionId,
    amountPaise: hold.amountPaise,
    currency: hold.currency,
    paidAt: new Date(hold.paidAt),
    purpose: hold.purpose,
    planKey: hold.planKey,
    period: hold.periodStart && hold.periodEnd ? { start: hold.periodStart, end: hold.periodEnd } : null,
  };
}

export type InvoiceServiceDeps = {
  supplier: SupplierConfig;
  /**
   * True only when Razorpay LIVE keys are configured. Anything else --
   * test keys, or no recognisable key at all -- issues TEST documents in
   * their own series: unknown must never mean "real".
   */
  livemode: boolean;
  /** The customer's current billing details and the business's own name, or null if the business is gone. */
  loadCustomer(businessId: string): Promise<{ details: CustomerBillingDetails; businessName: string } | null>;
  /** The invoice already issued for this payment, if any. */
  findInvoiceByPaymentId(paymentId: string): Promise<InvoiceRow | null>;
  /**
   * Atomically takes the next number for the invoice's financial year and
   * stores the invoice (`issue_invoice()`). Returns the existing invoice,
   * with `created: false`, when this payment already has one.
   */
  issue(draft: InvoiceDraft): Promise<{ invoice: InvoiceRow; created: boolean }>;
  recordHold(hold: InvoiceHold): Promise<void>;
  clearHold(paymentId: string): Promise<void>;
  /** Email + audit for an invoice. Must itself be at-most-once; called on replays too so a crash between issue and email self-heals. */
  afterIssued(invoice: InvoiceRow): Promise<void>;
  log(
    event: string,
    businessId: string,
    metadata?: Record<string, string | number | boolean | null>,
    level?: "info" | "error",
  ): void;
};

export type IssueInvoiceOutcome =
  | { status: "issued"; invoice: InvoiceRow; created: boolean }
  | { status: "held"; reason: HoldReason; detail: string }
  /** Nothing was charged (or not in INR): no invoice is owed, and none is made. */
  | { status: "skipped"; reason: "nothing_charged" | "unsupported_currency" };

/**
 * Issues the one invoice a successful payment is owed.
 *
 * - **Nothing charged, no invoice.** A zero (or negative) amount is
 *   skipped: a trial, an authentication hold and a failed payment have no
 *   supply to tax. Callers never reach this for a failed payment at all.
 * - **Idempotent.** The database's unique payment id is the lock; a replay
 *   returns the invoice that exists and takes no number.
 * - **A missing or invalid customer detail, or an unfinished supplier
 *   config, parks the payment instead of guessing.** The webhook still
 *   succeeds (a 500 loop would end with Razorpay disabling the endpoint),
 *   the problem is logged at error level, and the hold is retried by the
 *   daily sweep and whenever the customer saves billing details.
 * - A transient failure (the database is down) THROWS, so the webhook
 *   answers non-2xx and Razorpay retries.
 */
export async function issueInvoiceForPayment(
  deps: InvoiceServiceDeps,
  payment: PaymentForInvoice,
): Promise<IssueInvoiceOutcome> {
  if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) {
    deps.log("invoice_skipped_nothing_charged", payment.businessId, { paymentId: payment.paymentId });
    return { status: "skipped", reason: "nothing_charged" };
  }
  if (payment.currency !== "INR") {
    deps.log(
      "invoice_skipped_unsupported_currency",
      payment.businessId,
      { paymentId: payment.paymentId, currency: payment.currency },
      "error",
    );
    return { status: "skipped", reason: "unsupported_currency" };
  }

  // A payment that already has an invoice is finished business, whatever
  // state the customer's details or the supplier config are in now: it must
  // never be re-evaluated against them (and parked as a hold) just because
  // the same webhook was delivered twice.
  const existing = await deps.findInvoiceByPaymentId(payment.paymentId);
  if (existing) {
    await deps.afterIssued(existing);
    await deps.clearHold(payment.paymentId);
    deps.log("invoice_replay_returned_existing", payment.businessId, {
      invoiceNumber: existing.invoice_number,
      paymentId: payment.paymentId,
    });
    return { status: "issued", invoice: existing, created: false };
  }

  const problems = supplierConfigProblems(deps.supplier);
  if (problems.length > 0) {
    return park(deps, payment, "supplier_config_incomplete", problems.join("; "));
  }

  const loaded = await deps.loadCustomer(payment.businessId);
  if (!loaded) {
    // The business no longer exists, so there is no customer to invoice and
    // nowhere to show one. A payment against a deleted business is a
    // support matter, not something to retry.
    deps.log("invoice_skipped_unknown_business", payment.businessId, { paymentId: payment.paymentId }, "error");
    return { status: "held", reason: "invalid_customer_details", detail: "business no longer exists" };
  }

  const resolution = resolveInvoiceCustomer(loaded.details, loaded.businessName);
  if (!resolution.ok) {
    return park(deps, payment, resolution.reason, resolution.detail);
  }

  let issued: { invoice: InvoiceRow; created: boolean };
  try {
    const draft = buildInvoiceDraft({
      payment,
      customer: resolution.customer,
      supplier: deps.supplier,
      isTest: !deps.livemode,
    });
    issued = await deps.issue(draft);
  } catch (error) {
    if (error instanceof DocumentRejectedError || error instanceof InvoiceBuildError) {
      return park(deps, payment, "issue_failed", error.message);
    }
    throw error;
  }
  const { invoice, created } = issued;

  // Whether or not this call created it: afterIssued is at-most-once on its
  // own, and running it on a replay is what repairs a crash that happened
  // between the insert and the email.
  await deps.afterIssued(invoice);
  await deps.clearHold(payment.paymentId);

  deps.log(created ? "invoice_issued" : "invoice_lost_race_returned_existing", payment.businessId, {
    invoiceNumber: invoice.invoice_number,
    paymentId: payment.paymentId,
    totalPaise: invoice.total_paise,
    supplyType: invoice.supply_type,
  });
  return { status: "issued", invoice, created };
}

async function park(
  deps: InvoiceServiceDeps,
  payment: PaymentForInvoice,
  reason: HoldReason,
  detail: string,
): Promise<IssueInvoiceOutcome> {
  await deps.recordHold({
    paymentId: payment.paymentId,
    businessId: payment.businessId,
    reason,
    detail,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    purpose: payment.purpose,
    planKey: payment.planKey,
    orderId: payment.orderId,
    subscriptionId: payment.subscriptionId,
    paidAt: payment.paidAt.toISOString(),
    periodStart: payment.period?.start ?? null,
    periodEnd: payment.period?.end ?? null,
  });
  // Error level on purpose: a customer has paid and is owed a tax invoice we
  // cannot yet produce. That must reach Sentry, not scroll past.
  deps.log(
    "invoice_held",
    payment.businessId,
    { paymentId: payment.paymentId, reason, detail, amountPaise: payment.amountPaise },
    "error",
  );
  return { status: "held", reason, detail };
}

/* ------------------------------------------------------------------ *
 * Credit notes
 * ------------------------------------------------------------------ */

export type CreditNoteServiceDeps = {
  findCreditNoteByRefundId(refundId: string): Promise<CreditNoteRow | null>;
  findInvoiceByPaymentId(paymentId: string): Promise<InvoiceRow | null>;
  creditedSoFar(invoiceId: string): Promise<CreditedSoFar>;
  /** `issue_credit_note()`: atomic, idempotent on the refund id, refuses to exceed the invoice. */
  issue(draft: CreditNoteDraft): Promise<{ note: CreditNoteRow; created: boolean }>;
  afterIssued(note: CreditNoteRow): Promise<void>;
  log: InvoiceServiceDeps["log"];
};

export type IssueCreditNoteOutcome =
  | { status: "issued"; note: CreditNoteRow; created: boolean }
  /** The refund is for a payment we never invoiced (a Razorpay authentication refund, or a pre-invoicing test payment). */
  | { status: "no_invoice" }
  | {
      status: "refused";
      reason: "not_positive" | "exceeds_invoice" | "components_exceed_invoice";
      remainingPaise: number;
    };

export function isCreditNoteReason(value: unknown): value is CreditNoteReason {
  return typeof value === "string" && (CREDIT_NOTE_REASONS as readonly string[]).includes(value);
}

/**
 * Issues the credit note a refund of a taxed invoice requires.
 *
 * Idempotent on the Razorpay refund id, so the manual script, the
 * `refund.processed` webhook and a refund made in the Razorpay dashboard
 * can all land on the same refund and produce one note. **Refuses** a note
 * that would take the credit notes past the invoice -- across any number of
 * partial notes -- and the database enforces the same rule in a trigger, so
 * this refusal is the friendly one and not the only one.
 */
export async function issueCreditNoteForRefund(
  deps: CreditNoteServiceDeps,
  refund: {
    paymentId: string;
    refundId: string;
    amountPaise: number;
    refundedAt: Date;
    reason: CreditNoteReason;
  },
): Promise<IssueCreditNoteOutcome> {
  // A refund that already has its note is done: re-deriving amounts against
  // an invoice that note has already been credited from would see it as an
  // excess, so a replay is answered before any arithmetic.
  const existing = await deps.findCreditNoteByRefundId(refund.refundId);
  if (existing) {
    await deps.afterIssued(existing);
    deps.log("credit_note_replay_returned_existing", existing.business_id, {
      creditNoteNumber: existing.credit_note_number,
      refundId: refund.refundId,
    });
    return { status: "issued", note: existing, created: false };
  }

  const invoice = await deps.findInvoiceByPaymentId(refund.paymentId);
  if (!invoice) {
    deps.log("credit_note_no_invoice_for_payment", "unknown", { paymentId: refund.paymentId, refundId: refund.refundId });
    return { status: "no_invoice" };
  }

  const credited = (await deps.creditedSoFar(invoice.id)) ?? NOTHING_CREDITED;
  const result = computeCreditNoteAmounts(invoice, credited, refund.amountPaise);
  if (!result.ok) {
    deps.log(
      "credit_note_refused",
      invoice.business_id,
      {
        invoiceNumber: invoice.invoice_number,
        refundId: refund.refundId,
        reason: result.reason,
        remainingPaise: result.remainingPaise,
        refundPaise: refund.amountPaise,
      },
      "error",
    );
    return { status: "refused", reason: result.reason, remainingPaise: result.remainingPaise };
  }

  const draft = buildCreditNoteDraft({
    invoice,
    amounts: result.amounts,
    refundId: refund.refundId,
    refundedAt: refund.refundedAt,
    reason: refund.reason,
  });
  const { note, created } = await deps.issue(draft);
  await deps.afterIssued(note);

  deps.log(created ? "credit_note_issued" : "credit_note_lost_race_returned_existing", invoice.business_id, {
    creditNoteNumber: note.credit_note_number,
    invoiceNumber: invoice.invoice_number,
    totalPaise: note.total_paise,
  });
  return { status: "issued", note, created };
}
