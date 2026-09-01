import "server-only";
import { configureUnPDF, renderPageAsImage } from "unpdf";
import { logEvent } from "@/lib/logger";

/**
 * Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
 * photos). `unpdf`'s default build mocks `canvas` for serverless safety
 * (used by lib/file-ingestion.ts's plain text extraction); rendering an
 * actual page image requires switching to the official PDF.js build plus
 * the real `canvas` npm package (native bindings) -- configured once,
 * lazily, only when a page is actually being rendered.
 *
 * KNOWN, UNVERIFIED RISK (flagged in STATE.md, not glossed over): actual
 * page rendering depends on `@napi-rs/canvas` (prebuilt native bindings,
 * chosen over the classic `canvas` package specifically for better
 * serverless/Vercel compatibility -- confirmed as unpdf's own actual
 * `renderPageAsImage` option by reading its installed .d.ts, not assumed
 * from documentation, which described an older API shape). This has been
 * exercised in local development only -- it has NOT been confirmed
 * working on an actual Vercel deployment. That is exactly why every call
 * site treats a render failure as non-fatal: a product/service extracted
 * from this page still gets created, just without a photo, rather than
 * failing catalog extraction entirely.
 */
let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureUnPDF({ pdfjs: () => import("pdfjs-dist") });
  configured = true;
}

const RENDER_SCALE = 1.5;

/**
 * Renders one PDF page to a PNG buffer. Returns `null` on any failure
 * (corrupt page, native canvas unavailable in this runtime, etc.) --
 * never throws, per this module's doc comment. `businessId` is for
 * logging only, no data access happens here.
 */
export async function renderPdfPageToPng(
  pdfBytes: Uint8Array,
  pageNumber: number,
  businessId: string,
): Promise<Uint8Array | null> {
  try {
    ensureConfigured();
    const buffer = await renderPageAsImage(pdfBytes, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: RENDER_SCALE,
    });
    return new Uint8Array(buffer);
  } catch {
    logEvent("pdf_page_render_failed", businessId, { pageNumber }, "error");
    return null;
  }
}
