import { PLANS, gstBreakdown, splitGstTax, GST_RATE_PERCENT, type GstSupply, type PlanKey } from "@/lib/plans";
import { isIndianStateCode, stateNameForCode } from "@/lib/india-states";
import { validateGstin, gstinProblemMessage } from "@/lib/gstin";
import { financialYearForInstant, istDateString } from "@/lib/financial-year";
import { formatIsoDate } from "@/lib/invoice-format";
import { SERVICE_NAME, assertSupplierConfigReady, type SupplierConfig } from "@/lib/invoice-config";
import { ADDRESS_MAX_LINES, normalizeInvoiceText, unsupportedInvoiceCharacters } from "@/lib/invoice-text";

/**
 * The pure heart of Phase 17c: what a GST tax invoice and a credit note
 * contain, and how their figures are derived. No I/O, no `server-only`, so
 * scripts/run-invoice-tests.mjs drives every rule here directly.
 *
 * **The tax arithmetic is not written here.** An invoice's split comes from
 * `gstBreakdown()` in lib/plans.ts, and a credit note's from
 * `splitGstTax()` in the same file; this module only decides which gross to
 * hand them. There is one implementation of the rounding rule in the
 * codebase.
 *
 * **The gross is the amount actually PAID**, taken from the Razorpay
 * payment, never from the plan registry. A pro-rated upgrade charges an
 * amount that is not any plan's price, and an invoice stating the list
 * price when a different sum was collected would be wrong.
 */

export type DocumentPurpose = "subscription_charge" | "annual" | "upgrade_prorata";

export type CreditNoteReason =
  | "duplicate_or_incorrect_charge"
  | "charge_after_cancellation"
  | "sustained_outage"
  | "other";

export const CREDIT_NOTE_REASONS: readonly CreditNoteReason[] = [
  "duplicate_or_incorrect_charge",
  "charge_after_cancellation",
  "sustained_outage",
  "other",
];

export const CREDIT_NOTE_REASON_LABEL: Readonly<Record<CreditNoteReason, string>> = {
  duplicate_or_incorrect_charge: "Duplicate or incorrect charge",
  charge_after_cancellation: "Charge made after cancellation",
  sustained_outage: "Sustained service outage",
  other: "Refund",
};

/** One successful payment that is owed an invoice. */
export type PaymentForInvoice = {
  businessId: string;
  paymentId: string;
  orderId: string | null;
  subscriptionId: string | null;
  /** The sum actually collected, GST-inclusive, in paise. */
  amountPaise: number;
  currency: string;
  /** The instant the money was taken: decides the invoice date and the financial year. */
  paidAt: Date;
  purpose: DocumentPurpose;
  planKey: PlanKey;
  /** The service period this payment buys, as ISO instants; null when unknown. */
  period: { start: string; end: string } | null;
};

/* ------------------------------------------------------------------ *
 * The customer
 * ------------------------------------------------------------------ */

/** What the billing form stores, any of which may be absent. */
export type CustomerBillingDetails = {
  name: string | null;
  address: string | null;
  stateCode: string | null;
  gstin: string | null;
};

export type InvoiceCustomer = {
  name: string;
  address: string;
  stateCode: string;
  stateName: string;
  gstin: string | null;
};

export type CustomerResolution =
  | { ok: true; customer: InvoiceCustomer }
  | { ok: false; reason: "missing_customer_details" | "invalid_customer_details"; detail: string };

const NAME_MAX = 200;
const ADDRESS_MAX = 600;

/**
 * Turns whatever the billing form holds into the recipient block of an
 * invoice, or says exactly why it cannot.
 *
 * **It never fills a gap with a guess.** A missing state is
 * `missing_customer_details`, not a default state: the state decides the
 * tax layout, and an invoice with a fabricated place of supply is wrong in
 * a way the customer's accountant will find and we cannot fix. The caller
 * parks the payment instead (lib/invoice-service.ts).
 *
 * The name falls back to the business's own name, because that is a real
 * fact we hold and the customer can correct it for the future.
 */
export function resolveInvoiceCustomer(
  details: CustomerBillingDetails,
  businessName: string,
): CustomerResolution {
  const name = normalizeInvoiceText(details.name ?? businessName, { multiline: false });
  const address = normalizeInvoiceText(details.address ?? "", { multiline: true });

  if (!address) return { ok: false, reason: "missing_customer_details", detail: "billing address is missing" };
  if (!details.stateCode) return { ok: false, reason: "missing_customer_details", detail: "state is missing" };
  if (!name) return { ok: false, reason: "missing_customer_details", detail: "billing name is missing" };

  if (!isIndianStateCode(details.stateCode)) {
    return { ok: false, reason: "invalid_customer_details", detail: "state is not a recognised GST state code" };
  }
  const stateName = stateNameForCode(details.stateCode);
  if (!stateName) return { ok: false, reason: "invalid_customer_details", detail: "state is not recognised" };

  if (name.length > NAME_MAX) return { ok: false, reason: "invalid_customer_details", detail: "billing name is too long" };
  if (address.length > ADDRESS_MAX) {
    return { ok: false, reason: "invalid_customer_details", detail: "billing address is too long" };
  }
  if (address.split("\n").length > ADDRESS_MAX_LINES) {
    return { ok: false, reason: "invalid_customer_details", detail: "billing address has too many lines" };
  }
  if (unsupportedInvoiceCharacters(name).length > 0 || unsupportedInvoiceCharacters(address).length > 0) {
    return {
      ok: false,
      reason: "invalid_customer_details",
      detail: "billing name or address contains characters an invoice cannot print",
    };
  }

  let gstin: string | null = null;
  if (details.gstin && details.gstin.trim() !== "") {
    const checked = validateGstin(details.gstin, details.stateCode);
    if (!checked.ok) {
      return { ok: false, reason: "invalid_customer_details", detail: gstinProblemMessage(checked.problem) };
    }
    gstin = checked.gstin;
  }

  return { ok: true, customer: { name, address, stateCode: details.stateCode, stateName, gstin } };
}

/* ------------------------------------------------------------------ *
 * Invoice
 * ------------------------------------------------------------------ */

/** The row `issue_invoice()` is given: everything except what the database assigns under the lock. */
export type InvoiceDraft = {
  business_id: string;
  financial_year: string;
  invoice_date: string;
  payment_at: string;
  razorpay_payment_id: string;
  razorpay_order_id: string | null;
  razorpay_subscription_id: string | null;
  purpose: DocumentPurpose;
  plan_key: PlanKey;
  service_description: string;
  sac_code: string;
  service_period_start: string | null;
  service_period_end: string | null;
  supplier_name: string;
  supplier_address: string;
  supplier_gstin: string;
  supplier_state_code: string;
  supplier_state_name: string;
  customer_name: string;
  customer_address: string;
  customer_state_code: string;
  customer_state_name: string;
  customer_gstin: string | null;
  place_of_supply_state_code: string;
  place_of_supply_state_name: string;
  supply_type: GstSupply;
  gst_rate_percent: number;
  taxable_paise: number;
  cgst_paise: number | null;
  sgst_paise: number | null;
  igst_paise: number | null;
  tax_paise: number;
  total_paise: number;
  /** A document for a Razorpay TEST-mode payment: its own number series, stamped TEST on the PDF. */
  is_test: boolean;
};

/** An issued invoice, as the database returns it. */
export type InvoiceRow = InvoiceDraft & {
  id: string;
  invoice_number: string;
  sequence_number: number;
  issued_at: string;
  reverse_charge: false;
  currency: "INR";
};

/** The supply type is decided by comparing the customer's state with the supplier's, nothing else. */
export function supplyTypeFor(customerStateCode: string, supplierStateCode: string): GstSupply {
  return customerStateCode === supplierStateCode ? "intra-state" : "inter-state";
}

/**
 * The human-readable line item. The period is shown in IST, from the day it
 * starts to the day before it ends (Razorpay's `current_end` is the instant
 * the NEXT period starts, so printing it as the last day would overlap
 * consecutive invoices by a day).
 */
export function describeInvoiceLine(payment: PaymentForInvoice): string {
  const plan = PLANS[payment.planKey];
  const range = periodRangeLabel(payment.period);
  const suffix = range ? ` (${range})` : "";

  switch (payment.purpose) {
    case "annual":
      return `${SERVICE_NAME} ${plan.name} plan - annual subscription${suffix}`;
    case "upgrade_prorata":
      return `${SERVICE_NAME} - upgrade to the ${plan.name} plan, pro-rated for the rest of the billing period${suffix}`;
    case "subscription_charge":
      return `${SERVICE_NAME} ${plan.name} plan - monthly subscription${suffix}`;
  }
}

function periodRangeLabel(period: { start: string; end: string } | null): string | null {
  if (!period) return null;
  const start = new Date(period.start);
  const end = new Date(period.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  const lastDay = new Date(end.getTime() - 1000);
  return `${formatIsoDate(istDateString(start))} to ${formatIsoDate(istDateString(lastDay))}`;
}

export class InvoiceBuildError extends Error {}

/**
 * Builds the invoice to issue for one payment.
 *
 * Throws on anything that would make a wrong invoice (a non-positive or
 * fractional amount, a non-INR currency, an unusable supplier config), so a
 * defect is a loud failure here and never a quiet bad row. The supplier
 * config is checked HERE, not left to the caller: nothing can reach the
 * snapshot step with a `TODO` address.
 */
export function buildInvoiceDraft(params: {
  payment: PaymentForInvoice;
  customer: InvoiceCustomer;
  supplier: SupplierConfig;
  /** True for a payment taken with Razorpay TEST keys. */
  isTest: boolean;
}): InvoiceDraft {
  const { payment, customer } = params;
  const supplier = assertSupplierConfigReady(params.supplier);

  if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) {
    throw new InvoiceBuildError(`invoice amount must be a positive whole number of paise, got ${payment.amountPaise}`);
  }
  if (payment.currency !== "INR") {
    throw new InvoiceBuildError(`only INR payments are invoiced, got ${payment.currency}`);
  }
  if (!Number.isFinite(payment.paidAt.getTime())) throw new InvoiceBuildError("payment time is not a valid date");

  const supply = supplyTypeFor(customer.stateCode, supplier.stateCode);
  // The one place the tax is computed: from the gross actually collected.
  const split = gstBreakdown(payment.amountPaise, supply);

  return {
    business_id: payment.businessId,
    financial_year: financialYearForInstant(payment.paidAt),
    invoice_date: istDateString(payment.paidAt),
    payment_at: payment.paidAt.toISOString(),
    razorpay_payment_id: payment.paymentId,
    razorpay_order_id: payment.orderId,
    razorpay_subscription_id: payment.subscriptionId,
    purpose: payment.purpose,
    plan_key: payment.planKey,
    service_description: describeInvoiceLine(payment),
    sac_code: supplier.sacCode,
    service_period_start: payment.period?.start ?? null,
    service_period_end: payment.period?.end ?? null,
    supplier_name: supplier.name,
    supplier_address: supplier.address,
    supplier_gstin: supplier.gstin,
    supplier_state_code: supplier.stateCode,
    supplier_state_name: supplier.stateName,
    customer_name: customer.name,
    customer_address: customer.address,
    customer_state_code: customer.stateCode,
    customer_state_name: customer.stateName,
    customer_gstin: customer.gstin,
    // Place of supply is the customer's state (India-only, B2B/B2C services).
    place_of_supply_state_code: customer.stateCode,
    place_of_supply_state_name: customer.stateName,
    supply_type: supply,
    gst_rate_percent: GST_RATE_PERCENT,
    taxable_paise: split.taxablePaise,
    cgst_paise: split.supply === "intra-state" ? split.cgstPaise : null,
    sgst_paise: split.supply === "intra-state" ? split.sgstPaise : null,
    igst_paise: split.supply === "inter-state" ? split.igstPaise : null,
    tax_paise: split.taxPaise,
    total_paise: split.grossPaise,
    is_test: params.isTest,
  };
}

/* ------------------------------------------------------------------ *
 * Credit note
 * ------------------------------------------------------------------ */

/** What has already been credited against one invoice. */
export type CreditedSoFar = {
  totalPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export const NOTHING_CREDITED: CreditedSoFar = {
  totalPaise: 0,
  taxablePaise: 0,
  taxPaise: 0,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 0,
};

export type CreditNoteAmounts = {
  totalPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number | null;
  sgstPaise: number | null;
  igstPaise: number | null;
};

export type CreditNoteAmountsResult =
  | { ok: true; amounts: CreditNoteAmounts }
  | { ok: false; reason: "not_positive" | "exceeds_invoice" | "components_exceed_invoice"; remainingPaise: number };

/** round-half-up(numerator / denominator) in integers; operands here stay well under 2^53. */
function roundedQuotient(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Splits a refund into the taxable value and tax it reverses, **in
 * proportion to the invoice**, and refuses one that would take the notes
 * past the invoice.
 *
 * The method is cumulative on purpose. After this note the notes together
 * will have credited `C` of the invoice's gross `G`, so the tax reversed to
 * date is `round(C x invoiceTax / G)`; this note's tax is that minus what
 * earlier notes already reversed. Three properties follow, and each is
 * tested:
 *   - the final note, which brings `C` to `G`, reverses exactly the
 *     invoice's tax -- the notes add up to the invoice to the paisa;
 *   - tax is never reversed twice or lost to per-note rounding, however
 *     many partial notes there are;
 *   - CGST and SGST are derived from the cumulative tax with the same
 *     floor-and-remainder rule as the invoice (`splitGstTax`), so a series
 *     of one-paisa tax amounts cannot push SGST past what the invoice
 *     charged.
 */
export function computeCreditNoteAmounts(
  invoice: Pick<InvoiceDraft, "total_paise" | "tax_paise" | "taxable_paise" | "cgst_paise" | "sgst_paise" | "igst_paise" | "supply_type">,
  credited: CreditedSoFar,
  refundPaise: number,
): CreditNoteAmountsResult {
  const remainingPaise = invoice.total_paise - credited.totalPaise;

  if (!Number.isSafeInteger(refundPaise) || refundPaise <= 0) {
    return { ok: false, reason: "not_positive", remainingPaise };
  }
  if (refundPaise > remainingPaise) {
    return { ok: false, reason: "exceeds_invoice", remainingPaise };
  }

  const cumulativeGross = credited.totalPaise + refundPaise;
  const cumulativeTax =
    cumulativeGross === invoice.total_paise
      ? invoice.tax_paise
      : roundedQuotient(cumulativeGross * invoice.tax_paise, invoice.total_paise);
  const taxPaise = Math.max(0, cumulativeTax - credited.taxPaise);
  const taxablePaise = refundPaise - taxPaise;

  const supply = invoice.supply_type;
  const after = splitGstTax(credited.taxPaise + taxPaise, supply);
  const cgstPaise = after.supply === "intra-state" ? after.cgstPaise - credited.cgstPaise : null;
  const sgstPaise = after.supply === "intra-state" ? after.sgstPaise - credited.sgstPaise : null;
  const igstPaise = after.supply === "inter-state" ? after.igstPaise - credited.igstPaise : null;

  const exceeds =
    taxablePaise < 0 ||
    credited.taxablePaise + taxablePaise > invoice.taxable_paise ||
    (cgstPaise !== null && (cgstPaise < 0 || credited.cgstPaise + cgstPaise > (invoice.cgst_paise ?? 0))) ||
    (sgstPaise !== null && (sgstPaise < 0 || credited.sgstPaise + sgstPaise > (invoice.sgst_paise ?? 0))) ||
    (igstPaise !== null && (igstPaise < 0 || credited.igstPaise + igstPaise > (invoice.igst_paise ?? 0)));
  if (exceeds) return { ok: false, reason: "components_exceed_invoice", remainingPaise };

  return {
    ok: true,
    amounts: { totalPaise: refundPaise, taxablePaise, taxPaise, cgstPaise, sgstPaise, igstPaise },
  };
}

/** The row `issue_credit_note()` is given. */
export type CreditNoteDraft = {
  business_id: string;
  financial_year: string;
  credit_note_date: string;
  refund_at: string;
  invoice_id: string;
  original_invoice_number: string;
  original_invoice_date: string;
  razorpay_refund_id: string;
  razorpay_payment_id: string;
  reason: CreditNoteReason;
  service_description: string;
  sac_code: string;
  supplier_name: string;
  supplier_address: string;
  supplier_gstin: string;
  supplier_state_code: string;
  supplier_state_name: string;
  customer_name: string;
  customer_address: string;
  customer_state_code: string;
  customer_state_name: string;
  customer_gstin: string | null;
  place_of_supply_state_code: string;
  place_of_supply_state_name: string;
  supply_type: GstSupply;
  gst_rate_percent: number;
  taxable_paise: number;
  cgst_paise: number | null;
  sgst_paise: number | null;
  igst_paise: number | null;
  tax_paise: number;
  total_paise: number;
  is_test: boolean;
};

export type CreditNoteRow = CreditNoteDraft & {
  id: string;
  credit_note_number: string;
  sequence_number: number;
  issued_at: string;
  reverse_charge: false;
  currency: "INR";
};

/**
 * Builds a credit note from the invoice it reverses. Every party and
 * figure that is not the refund itself is copied from the invoice's own
 * snapshot -- not re-read from the live subscription -- so the note shows
 * the supplier, customer and place of supply the original showed, even if
 * the customer has changed their details since. The financial year is the
 * REFUND's, in IST: a credit note is a document of the year it is issued
 * in, whichever year the invoice belonged to.
 */
export function buildCreditNoteDraft(params: {
  invoice: InvoiceRow;
  amounts: CreditNoteAmounts;
  refundId: string;
  refundedAt: Date;
  reason: CreditNoteReason;
}): CreditNoteDraft {
  const { invoice, amounts } = params;
  if (!Number.isFinite(params.refundedAt.getTime())) throw new InvoiceBuildError("refund time is not a valid date");

  return {
    business_id: invoice.business_id,
    financial_year: financialYearForInstant(params.refundedAt),
    credit_note_date: istDateString(params.refundedAt),
    refund_at: params.refundedAt.toISOString(),
    invoice_id: invoice.id,
    original_invoice_number: invoice.invoice_number,
    original_invoice_date: invoice.invoice_date,
    razorpay_refund_id: params.refundId,
    razorpay_payment_id: invoice.razorpay_payment_id,
    reason: params.reason,
    service_description: invoice.service_description,
    sac_code: invoice.sac_code,
    supplier_name: invoice.supplier_name,
    supplier_address: invoice.supplier_address,
    supplier_gstin: invoice.supplier_gstin,
    supplier_state_code: invoice.supplier_state_code,
    supplier_state_name: invoice.supplier_state_name,
    customer_name: invoice.customer_name,
    customer_address: invoice.customer_address,
    customer_state_code: invoice.customer_state_code,
    customer_state_name: invoice.customer_state_name,
    customer_gstin: invoice.customer_gstin,
    place_of_supply_state_code: invoice.place_of_supply_state_code,
    place_of_supply_state_name: invoice.place_of_supply_state_name,
    supply_type: invoice.supply_type,
    gst_rate_percent: invoice.gst_rate_percent,
    taxable_paise: amounts.taxablePaise,
    cgst_paise: amounts.cgstPaise,
    sgst_paise: amounts.sgstPaise,
    igst_paise: amounts.igstPaise,
    tax_paise: amounts.taxPaise,
    total_paise: amounts.totalPaise,
    // A credit note belongs to the series of the invoice it reverses.
    is_test: invoice.is_test,
  };
}
