import { NextRequest } from "next/server";
import { requireBillingDownloadAccess, pdfResponse } from "@/lib/billing-download";
import { getCreditNoteForBusiness } from "@/lib/invoice-queries";
import { creditNoteToView, renderTaxDocumentPdf } from "@/lib/invoice-pdf";
import { logEvent } from "@/lib/logger";

/**
 * Downloads one credit note as a PDF (Phase 17c). Same contract as
 * app/api/billing/invoices/[id]/pdf/route.ts: org:admin of the owning
 * business only, rendered on demand from the immutable stored snapshot, and
 * anyone else's id is an indistinguishable 404.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireBillingDownloadAccess(request);
  if (access instanceof Response) return access;

  const { id } = await context.params;
  const note = await getCreditNoteForBusiness(access.businessId, id);
  if (!note) return new Response("Not found", { status: 404 });

  try {
    const pdf = await renderTaxDocumentPdf(creditNoteToView(note));
    return pdfResponse(pdf, `${note.credit_note_number}.pdf`);
  } catch (error) {
    logEvent("credit_note_pdf_render_failed", access.businessId, { creditNoteNumber: note.credit_note_number }, "error");
    console.error(error);
    return new Response("We could not generate that PDF. Please try again.", { status: 500 });
  }
}
