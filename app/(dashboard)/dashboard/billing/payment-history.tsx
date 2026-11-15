import { Download, FileWarning } from "lucide-react";
import { formatIsoDate, formatPaiseAsInr2dp } from "@/lib/invoice-format";
import { istDateString } from "@/lib/financial-year";
import type { CreditNoteRow, InvoiceRow } from "@/lib/invoice-core";
import type { InvoiceHoldRow } from "@/lib/invoice-schemas";

/**
 * Payment history: every GST tax invoice and credit note, newest first,
 * each with a download link (Phase 17c). A server component -- nothing
 * here needs the browser.
 *
 * The download links point at org-scoped route handlers
 * (app/api/billing/{invoices,credit-notes}/[id]/pdf) that check the
 * caller's role and business on the server for every request; showing a
 * link is a convenience, never the access control.
 *
 * Money is shown with TWO decimals (formatPaiseAsInr2dp), never the
 * whole-rupee formatter: an invoice total is a whole number of rupees only
 * by coincidence of the current price list, and a pro-rated upgrade or a
 * partial credit note is not.
 */

type HistoryRow = {
  key: string;
  kind: "invoice" | "credit_note";
  number: string;
  dateIso: string;
  sort: string;
  description: string;
  amountPaise: number;
  isTest: boolean;
  href: string;
};

function buildRows(invoices: InvoiceRow[], creditNotes: CreditNoteRow[]): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...invoices.map(
      (invoice): HistoryRow => ({
        key: `invoice-${invoice.id}`,
        kind: "invoice",
        number: invoice.invoice_number,
        dateIso: invoice.invoice_date,
        sort: `${invoice.invoice_date}|${invoice.issued_at}`,
        description: invoice.service_description,
        amountPaise: invoice.total_paise,
        isTest: invoice.is_test,
        href: `/api/billing/invoices/${invoice.id}/pdf`,
      }),
    ),
    ...creditNotes.map(
      (note): HistoryRow => ({
        key: `credit-${note.id}`,
        kind: "credit_note",
        number: note.credit_note_number,
        dateIso: note.credit_note_date,
        sort: `${note.credit_note_date}|${note.issued_at}`,
        description: `Credit against ${note.original_invoice_number}`,
        amountPaise: note.total_paise,
        isTest: note.is_test,
        href: `/api/billing/credit-notes/${note.id}/pdf`,
      }),
    ),
  ];
  return rows.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0));
}

export function PaymentHistory({
  invoices,
  creditNotes,
  holds,
  isTrial,
}: {
  invoices: InvoiceRow[];
  creditNotes: CreditNoteRow[];
  holds: InvoiceHoldRow[];
  isTrial: boolean;
}) {
  const rows = buildRows(invoices, creditNotes);
  const customerHolds = holds.filter(
    (hold) => hold.reason === "missing_customer_details" || hold.reason === "invalid_customer_details",
  );
  const ourHolds = holds.length - customerHolds.length;

  return (
    <section aria-labelledby="payment-history-heading" className="dx-card flex flex-col gap-4 dx-card-pad">
      <div className="flex flex-col gap-1">
        <h2 id="payment-history-heading" className="dx-title text-base">
          Payment history
        </h2>
        <p className="dx-subtitle max-w-3xl">
          Every payment gets a GST tax invoice, and every refund a credit note. Download the PDF for
          your accountant at any time.
        </p>
      </div>

      {customerHolds.map((hold) => (
        <div
          key={hold.razorpay_payment_id}
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-ds-warning-bg p-4"
        >
          <FileWarning strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">Invoice waiting for your billing details</p>
            <p className="text-sm text-ds-text-primary">
              We received {formatPaiseAsInr2dp(hold.amount_paise)} on{" "}
              {formatIsoDate(istDateString(new Date(hold.payment_at)))} but cannot issue its tax invoice yet
              {hold.detail ? ` (${hold.detail})` : ""}.{" "}
              <a href="#billing-details" className="font-medium text-ds-primary underline underline-offset-4">
                Add your billing details
              </a>{" "}
              and it is issued and emailed to you straight away.
            </p>
          </div>
        </div>
      ))}

      {ourHolds > 0 ? (
        <div role="status" className="rounded-2xl bg-ds-surface-soft p-4 text-sm text-ds-text-primary">
          {ourHolds === 1 ? "One invoice is" : `${ourHolds} invoices are`} being prepared and will arrive by email
          shortly. Nothing is needed from you.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-ds-surface-soft p-6 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No payments yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ds-text-secondary">
            {isTrial
              ? "You are on a free trial, so nothing has been charged and there are no invoices. Your first tax invoice is issued, and emailed to you, the moment your first payment is taken."
              : "Once a payment is taken, its tax invoice appears here and in your inbox."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">Invoices and credit notes, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className="dx-th px-4 py-2.5">Date</th>
                <th scope="col" className="dx-th px-4 py-2.5">Document</th>
                <th scope="col" className="dx-th px-4 py-2.5">Details</th>
                <th scope="col" className="dx-th px-4 py-2.5 text-right">Amount</th>
                <th scope="col" className="dx-th px-4 py-2.5 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="align-top">
                  <td className="border-b border-ds-border px-4 py-3 whitespace-nowrap text-ds-text-primary">{formatIsoDate(row.dateIso)}</td>
                  <td className="border-b border-ds-border px-4 py-3">
                    <span className="font-medium text-ds-text-primary">{row.number}</span>
                    <span className="mt-0.5 block text-sm text-ds-text-secondary">
                      {row.kind === "invoice" ? "Tax invoice" : "Credit note"}
                      {row.isTest ? (
                        <span className="dx-pill ml-2 bg-ds-warning-bg px-2 py-0.5 text-xs font-medium text-ds-warning">
                          TEST
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="max-w-[22rem] border-b border-ds-border px-4 py-3 text-ds-text-primary">{row.description}</td>
                  <td className="border-b border-ds-border px-4 py-3 text-right font-medium whitespace-nowrap text-ds-text-primary">
                    {row.kind === "credit_note" ? "-" : ""}
                    {formatPaiseAsInr2dp(row.amountPaise)}
                  </td>
                  <td className="border-b border-ds-border px-4 py-3 text-right">
                    <a
                      href={row.href}
                      className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-ds-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                    >
                      <Download strokeWidth={1.75} className="size-4" aria-hidden="true" />
                      <span>
                        Download<span className="sr-only"> {row.number}</span>
                      </span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
