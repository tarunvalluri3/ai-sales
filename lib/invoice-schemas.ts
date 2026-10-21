import { z } from "zod";
import { PLAN_KEYS } from "@/lib/plans";
import type { CreditNoteRow, InvoiceRow } from "@/lib/invoice-core";

/**
 * Zod schemas for the rows `public.invoices` and `public.credit_notes`
 * return (Phase 17c). Every read of a legal record is validated at the
 * boundary: a row this app cannot describe must fail loudly, not render a
 * tax invoice with an `undefined` where an amount should be. NOT
 * "server-only" -- the schemas are plain data checks.
 *
 * Money columns are `bigint` in Postgres; PostgREST returns them as JSON
 * numbers, which are exact up to 2^53 paise (about 9 x 10^13 rupees), far
 * beyond any invoice here.
 */

const paise = z.number().int().nonnegative();
const nullablePaise = paise.nullable();

const partyFields = {
  supplier_name: z.string(),
  supplier_address: z.string(),
  supplier_gstin: z.string(),
  supplier_state_code: z.string(),
  supplier_state_name: z.string(),
  customer_name: z.string(),
  customer_address: z.string(),
  customer_state_code: z.string(),
  customer_state_name: z.string(),
  customer_gstin: z.string().nullable(),
  place_of_supply_state_code: z.string(),
  place_of_supply_state_name: z.string(),
  supply_type: z.enum(["intra-state", "inter-state"]),
  gst_rate_percent: z.number(),
  taxable_paise: paise,
  cgst_paise: nullablePaise,
  sgst_paise: nullablePaise,
  igst_paise: nullablePaise,
  tax_paise: paise,
  total_paise: paise,
  is_test: z.boolean(),
};

export const invoiceRowSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  invoice_number: z.string(),
  financial_year: z.string(),
  sequence_number: z.number().int(),
  invoice_date: z.string(),
  payment_at: z.string(),
  issued_at: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string().nullable(),
  razorpay_subscription_id: z.string().nullable(),
  purpose: z.enum(["subscription_charge", "annual", "upgrade_prorata"]),
  plan_key: z.enum(PLAN_KEYS),
  service_description: z.string(),
  sac_code: z.string(),
  service_period_start: z.string().nullable(),
  service_period_end: z.string().nullable(),
  reverse_charge: z.literal(false),
  currency: z.literal("INR"),
  ...partyFields,
});

export const creditNoteRowSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  credit_note_number: z.string(),
  financial_year: z.string(),
  sequence_number: z.number().int(),
  credit_note_date: z.string(),
  refund_at: z.string(),
  issued_at: z.string(),
  invoice_id: z.string(),
  original_invoice_number: z.string(),
  original_invoice_date: z.string(),
  razorpay_refund_id: z.string(),
  razorpay_payment_id: z.string(),
  reason: z.enum(["duplicate_or_incorrect_charge", "charge_after_cancellation", "sustained_outage", "other"]),
  service_description: z.string(),
  sac_code: z.string(),
  reverse_charge: z.literal(false),
  currency: z.literal("INR"),
  ...partyFields,
});

export const invoiceHoldRowSchema = z.object({
  razorpay_payment_id: z.string(),
  business_id: z.string(),
  reason: z.enum(["missing_customer_details", "invalid_customer_details", "supplier_config_incomplete", "issue_failed"]),
  detail: z.string().nullable(),
  amount_paise: paise,
  currency: z.string(),
  purpose: z.enum(["subscription_charge", "annual", "upgrade_prorata"]),
  plan_key: z.enum(PLAN_KEYS).nullable(),
  razorpay_order_id: z.string().nullable(),
  razorpay_subscription_id: z.string().nullable(),
  payment_at: z.string(),
  service_period_start: z.string().nullable(),
  service_period_end: z.string().nullable(),
  attempts: z.number().int(),
  created_at: z.string(),
  last_attempt_at: z.string(),
});

export type InvoiceHoldRow = z.infer<typeof invoiceHoldRowSchema>;

/** Parses a database row into an `InvoiceRow`, or throws with the column that is wrong. */
export function parseInvoiceRow(data: unknown): InvoiceRow {
  return invoiceRowSchema.parse(data) as InvoiceRow;
}

export function parseCreditNoteRow(data: unknown): CreditNoteRow {
  return creditNoteRowSchema.parse(data) as CreditNoteRow;
}
