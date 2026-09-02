import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { configureUnPDF, renderPageAsImage } from "unpdf";
import { logEvent } from "@/lib/logger";

/**
 * Neither `import.meta.resolve` nor `createRequire(...).resolve` return a
 * real filesystem path here -- confirmed live, twice: the first threw
 * ("s.resolve is not a function"), the second silently returned a
 * Turbopack-internal numeric module id (e.g. `983143`) instead of a
 * string, because this file itself is still bundled/transformed by
 * Turpoback even though `pdfjs-dist` is marked external -- only code
 * inside the external package gets real Node `require` semantics, not
 * code calling into it. `process.cwd()` + plain path joining is pure
 * string manipulation, not a resolution API, so nothing bundler-shims it;
 * confirmed live that `process.cwd()` is the deployed function's root
 * (where `node_modules` actually lives) via a direct existsSync check.
 */
function resolvePdfWorkerSrc(): string | null {
  const candidate = join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.mjs");
  return existsSync(candidate) ? candidate : null;
}

/**
 * Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
 * photos). `unpdf`'s default build mocks `canvas` for serverless safety
 * (used by lib/file-ingestion.ts's plain text extraction); rendering an
 * actual page image requires switching to the official PDF.js build plus
 * the real `canvas` npm package (native bindings) -- configured once,
 * lazily, only when a page is actually being rendered.
 *
 * KNOWN, CONFIRMED-STILL-BROKEN on real Vercel production (STATE.md,
 * "PDF page-image rendering root-cause fix" -- not glossed over, and not
 * the original "never tested" state anymore). Three real, distinct bugs
 * were found and fixed by testing live against production, each
 * confirmed by watching the actual error change to a different one:
 * (1) `ensureConfigured()` fired its async reconfiguration without
 * awaiting it, and its caller didn't await it either -- a genuine race
 * against unpdf's own default resolution (triggered elsewhere by
 * `lib/file-ingestion.ts`'s plain-text extraction), which is how a fake
 * "API version does not match the Worker version" error occurred; (2)
 * `pdfjs-dist`/`unpdf` needed `serverExternalPackages` (next.config.ts),
 * same class of problem `@napi-rs/canvas` already had; (3) pdf.js's
 * `GlobalWorkerOptions.workerSrc` needed to be set explicitly (its own
 * docs: "should always be set"), which itself needed `process.cwd()` +
 * plain path joining, not `require.resolve`/`import.meta.resolve` --
 * both returned bundler-internal values, not real filesystem paths, when
 * called from this still-Turbopack-bundled file (confirmed live via a
 * temporary diagnostic route, since deleted).
 *
 * Still unresolved past that point: `hashOriginal.toHex is not a
 * function`, somewhere deeper inside pdf.js/@napi-rs/canvas's own
 * rendering internals -- a genuinely different, unrelated failure,
 * not investigated further (see STATE.md's backlog). Every call site
 * still treats a render failure as non-fatal: a product/service
 * extracted from this page still gets created, just without a photo.
 */
let configured: Promise<void> | null = null;
async function ensureConfigured(): Promise<void> {
  if (!configured) {
    configured = (async () => {
      const pdfjsModule = await import("pdfjs-dist");
      const workerSrc = resolvePdfWorkerSrc();
      if (workerSrc) {
        pdfjsModule.GlobalWorkerOptions.workerSrc = workerSrc;
      }
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
    // Kept permanently (not the original bare catch{}): this codepath's
    // failure mode is real and confirmed on production (see this file's
    // doc comment), so a bare catch swallowing the error entirely made it
    // undiagnosable. Never anything but the native error's own message --
    // no PDF content, no business data.
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logEvent("pdf_page_render_failed", businessId, { pageNumber, errorMessage: errorMessage.slice(0, 500) }, "error");
    return null;
  }
}
