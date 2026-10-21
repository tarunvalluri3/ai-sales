import { NextRequest } from "next/server";
import { requireBillingDownloadAccess, pdfResponse } from "@/lib/billing-download";
import { getInvoiceForBusiness } from "@/lib/invoice-queries";
import { invoiceToView, renderTaxDocumentPdf } from "@/lib/invoice-pdf";
import { logEvent } from "@/lib/logger";

/**
 * Downloads one GST tax invoice as a PDF (Phase 17c), rendered on demand
 * from the immutable snapshot stored when it was issued -- so there is no
 * file anywhere to fall out of sync with the record.
 *
 * Org-scoped on the server: see lib/billing-download.ts. The invoice is
 * fetched with the Clerk-session client (RLS) AND filtered by the caller's
 * own business id; anyone else's invoice id is a 404 indistinguishable from
 * one that does not exist.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireBillingDownloadAccess(request);
  if (access instanceof Response) return access;

  const { id } = await context.params;
  const invoice = await getInvoiceForBusiness(access.businessId, id);
  if (!invoice) return new Response("Not found", { status: 404 });

  try {
    const pdf = await renderTaxDocumentPdf(invoiceToView(invoice));
    return pdfResponse(pdf, `${invoice.invoice_number}.pdf`);
  } catch (error) {
    logEvent("invoice_pdf_render_failed", access.businessId, { invoiceNumber: invoice.invoice_number }, "error");
    console.error(error);
    return new Response("We could not generate that PDF. Please try again.", { status: 500 });
  }
}
