import "server-only";
import { createRequire } from "node:module";
import { configureUnPDF, renderPageAsImage } from "unpdf";
import { logEvent } from "@/lib/logger";

// `import.meta.resolve` isn't available in this route's actual bundled
// runtime (confirmed live: threw "s.resolve is not a function" on
// Vercel) -- createRequire's CJS-style resolution is the portable
// fallback, and works correctly with pdfjs-dist in
// `serverExternalPackages` (real, unbundled files on disk at deploy time).
const require = createRequire(import.meta.url);

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
/**
 * Real bug found live (STATE.md, "PDF page-image rendering root-cause
 * fix"): this used to be `function ensureConfigured(): void` calling
 * `configureUnPDF(...)` without awaiting it, and its one caller below
 * didn't await it either -- a genuine race between this module's
 * reconfiguration finishing and unpdf's own internal, unconfigured
 * default resolution (triggered by `lib/file-ingestion.ts`'s plain-text
 * `extractText()` calls elsewhere) winning first, which is how a fake
 * "API version 6.3.289 does not match the Worker version 6.1.200" error
 * -- a real, reproducible failure on Vercel, not a local-only quirk --
 * came from. Also explicitly sets `GlobalWorkerOptions.workerSrc` to
 * this exact resolved module's own worker file, per pdfjs-dist's own
 * documented recommendation that this "should always be set" -- belt
 * and suspenders against the same class of mismatch recurring.
 */
let configured: Promise<void> | null = null;
async function ensureConfigured(): Promise<void> {
  if (!configured) {
    configured = (async () => {
      const pdfjsModule = await import("pdfjs-dist");
      pdfjsModule.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
      await configureUnPDF({ pdfjs: () => Promise.resolve(pdfjsModule) });
    })();
  }
  await configured;
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
    await ensureConfigured();
    const buffer = await renderPageAsImage(pdfBytes, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: RENDER_SCALE,
    });
    return new Uint8Array(buffer);
  } catch (error) {
    // Temporary: this codepath's failure mode has never been observed on a
    // real Vercel deployment (see this file's doc comment) -- capture the
    // actual error message once, to diagnose, then revert to the plain
    // catch. Never anything but the native error's own message -- no PDF
    // content, no business data.
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logEvent("pdf_page_render_failed", businessId, { pageNumber, errorMessage: errorMessage.slice(0, 500) }, "error");
    return null;
  }
}
