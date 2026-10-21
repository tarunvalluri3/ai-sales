import "server-only";
import { getAppUrl } from "@/lib/app-url";
import { renderBrandedEmail, type BrandedEmail } from "@/lib/email-template";
import { formatIsoDate, formatPaiseAsInr2dp } from "@/lib/invoice-format";
import { CREDIT_NOTE_REASON_LABEL, type CreditNoteRow, type InvoiceRow } from "@/lib/invoice-core";

/**
 * The emails that accompany a GST document (Phase 17c): the invoice, the
 * credit note, and the "we need your billing details" message for a payment
 * whose invoice has been parked.
 *
 * All of them go to the **business** (never to a prospect), so they keep
 * the Waves AI Pilot lockup -- no `senderName` -- and leave through
 * lib/email-sender.ts, which owns suppression, the from-address and reply
 * routing. The PDF travels as an attachment AND as a link: the attachment
 * is what an accountant forwards, the link is what still works next year.
 * The link goes to a route that requires an org:admin session of the
 * owning business; being emailed it does not make it public.
 */

export type DocumentEmail = { subject: string; email: BrandedEmail };

export function invoicePdfUrl(invoiceId: string): string {
  return `${getAppUrl()}/api/billing/invoices/${invoiceId}/pdf`;
}

export function creditNotePdfUrl(creditNoteId: string): string {
  return `${getAppUrl()}/api/billing/credit-notes/${creditNoteId}/pdf`;
}

function taxFacts(row: InvoiceRow | CreditNoteRow): { label: string; value: string }[] {
  const half = row.gst_rate_percent / 2;
  const halfLabel = Number.isInteger(half) ? String(half) : half.toFixed(1);
  return row.supply_type === "intra-state"
    ? [
        { label: `CGST @ ${halfLabel}%`, value: formatPaiseAsInr2dp(row.cgst_paise ?? 0) },
        { label: `SGST @ ${halfLabel}%`, value: formatPaiseAsInr2dp(row.sgst_paise ?? 0) },
      ]
    : [{ label: `IGST @ ${row.gst_rate_percent}%`, value: formatPaiseAsInr2dp(row.igst_paise ?? 0) }];
}

/** A document for a Razorpay TEST payment is marked in the subject and the body; it must never read as a real tax document. */
function testTag(isTest: boolean): string {
  return isTest ? "[TEST] " : "";
}

const TEST_NOTICE =
  "This is a TEST document, issued for a test-mode payment. It is not a tax invoice, nothing was supplied, and no GST is payable on it.";

export function buildInvoiceEmail(invoice: InvoiceRow): DocumentEmail {
  return {
    subject: `${testTag(invoice.is_test)}Tax invoice ${invoice.invoice_number} from Waves AI Pilot`,
    email: renderBrandedEmail({
      heading: `Your tax invoice ${invoice.invoice_number}`,
      paragraphs: [
        ...(invoice.is_test ? [TEST_NOTICE] : []),
        `Thank you. Here is the GST tax invoice for the payment we received on ${formatIsoDate(invoice.invoice_date)}. It is attached as a PDF, and you can download it again at any time from Billing.`,
        "Keep it for your records: it is the document your accountant needs to claim input tax credit.",
      ],
      facts: [
        { label: "Invoice number", value: invoice.invoice_number },
        { label: "Invoice date", value: formatIsoDate(invoice.invoice_date) },
        { label: "For", value: invoice.service_description },
        { label: "Taxable value", value: formatPaiseAsInr2dp(invoice.taxable_paise) },
        ...taxFacts(invoice),
        { label: "Total paid", value: formatPaiseAsInr2dp(invoice.total_paise) },
      ],
      cta: { label: "Download invoice (PDF)", url: invoicePdfUrl(invoice.id) },
      footnote:
        "The invoice is issued to the billing name, address and state saved on your account when you paid. Changes you make to those details apply to future invoices only; an issued invoice is never altered.",
    }),
  };
}

export function buildCreditNoteEmail(note: CreditNoteRow): DocumentEmail {
  return {
    subject: `${testTag(note.is_test)}Credit note ${note.credit_note_number} from Waves AI Pilot`,
    email: renderBrandedEmail({
      heading: `Your credit note ${note.credit_note_number}`,
      paragraphs: [
        ...(note.is_test ? [TEST_NOTICE] : []),
        `We have refunded ${formatPaiseAsInr2dp(note.total_paise)}, and this credit note records it against tax invoice ${note.original_invoice_number}. It is attached as a PDF, and you can download it again from Billing.`,
        "Refunds go back to the original payment method; your bank decides how long that takes to show up.",
      ],
      facts: [
        { label: "Credit note number", value: note.credit_note_number },
        { label: "Against invoice", value: `${note.original_invoice_number} (${formatIsoDate(note.original_invoice_date)})` },
        { label: "Reason", value: CREDIT_NOTE_REASON_LABEL[note.reason] },
        { label: "Taxable value credited", value: formatPaiseAsInr2dp(note.taxable_paise) },
        ...taxFacts(note),
        { label: "Total credited", value: formatPaiseAsInr2dp(note.total_paise) },
      ],
      cta: { label: "Download credit note (PDF)", url: creditNotePdfUrl(note.id) },
    }),
  };
}

/** Sent when a payment is parked because the customer's billing details are missing or wrong. */
export function buildInvoiceHeldEmail(params: {
  amountPaise: number;
  paidOnDate: string;
  detail: string;
}): DocumentEmail {
  return {
    subject: "We need your billing details to issue your tax invoice",
    email: renderBrandedEmail({
      heading: "We need your billing details",
      paragraphs: [
        `We received your payment of ${formatPaiseAsInr2dp(params.amountPaise)} on ${formatIsoDate(params.paidOnDate)}, but we cannot issue the GST tax invoice for it yet: ${params.detail}.`,
        "Please open Billing and fill in your billing name, address and state (and your GSTIN, if you are registered). The moment you save them we issue the invoice automatically and email it to you -- there is nothing else to do.",
      ],
      cta: { label: "Add billing details", url: `${getAppUrl()}/dashboard/billing` },
      footnote: "We will not guess a state or an address on a tax invoice: it cannot be changed once it is issued.",
    }),
  };
}
