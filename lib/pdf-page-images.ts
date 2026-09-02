import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { configureUnPDF, getResolvedPDFJS, renderPageAsImage } from "unpdf";
import { logEvent } from "@/lib/logger";

// `toHex`/`fromHex`/`toBase64`/`fromBase64` are too new for the installed
// TypeScript lib.d.ts to know about yet -- declared here (optional,
// matching that it may genuinely be absent at runtime) rather than
// silencing the checker with a cast.
declare global {
  interface Uint8Array {
    toHex?(): string;
  }
  interface Map<K, V> {
    getOrInsert?(key: K, value: V): V;
    getOrInsertComputed?(key: K, callbackFn: (key: K) => V): V;
  }
}

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
 * `Uint8Array.prototype.toHex()` only shipped unflagged in Node.js 25
 * (V8 14.1, October 2025) -- confirmed against Node's own release notes,
 * not assumed. This Vercel project runs Node 24.x (the LTS track; 25 is
 * Current, not LTS, so pinning the whole app to it just for this one
 * pdf.js call is a worse trade than a small polyfill). pdf.js 6.3.289's
 * document-fingerprint code (`pdf.worker.mjs`'s `fingerprints` getter)
 * calls this unconditionally while loading any document -- confirmed
 * live as the exact cause of `hashOriginal.toHex is not a function`.
 * Only defined if genuinely missing, so this becomes a no-op the moment
 * the deployed runtime's own native version exists.
 */
function ensureUint8ArrayToHexPolyfill(): void {
  if (typeof Uint8Array.prototype.toHex === "function") return;
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value(this: Uint8Array): string {
      return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
    },
    writable: true,
    configurable: true,
  });
}

/**
 * `Map.prototype.getOrInsert`/`getOrInsertComputed()` (the "Map Upsert"
 * TC39 proposal) only shipped unflagged in Node.js 26 (V8 14.6, May
 * 2026, confirmed against Node's own release notes) -- an even newer gap
 * than `toHex`'s, found immediately after fixing that one, live. pdf.js
 * uses these 16 times internally (confirmed via a direct grep of the
 * installed `pdf.worker.mjs`) for its own caching, present even in
 * 6.2.108 -- not a version-specific bleeding-edge choice worth chasing
 * further downgrades for, especially since npm audit's GHSA-hq66-cqwq-w95j
 * makes anything below 6.2.108 a real vulnerability, not just an older
 * API surface. Same self-disabling shape as the `toHex` polyfill above.
 */
function ensureMapUpsertPolyfill(): void {
  if (typeof Map.prototype.getOrInsert !== "function") {
    Object.defineProperty(Map.prototype, "getOrInsert", {
      value<K, V>(this: Map<K, V>, key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
  if (typeof Map.prototype.getOrInsertComputed !== "function") {
    Object.defineProperty(Map.prototype, "getOrInsertComputed", {
      value<K, V>(this: Map<K, V>, key: K, callbackFn: (key: K) => V): V {
        if (this.has(key)) return this.get(key) as V;
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
 * photos). `unpdf`'s default build mocks `canvas` for serverless safety
 * (used by lib/file-ingestion.ts's plain text extraction); rendering an
 * actual page image requires switching to the official PDF.js build plus
 * the real `canvas` npm package (native bindings) -- configured once,
 * lazily, only when a page is actually being rendered.
 *
 * CONFIRMED WORKING on real Vercel production (STATE.md, "PDF
 * page-image rendering root-cause fix") -- not the original "never
 * tested" state, and not the long stretch of "still broken" in between
 * either. Verified end-to-end: a real PDF with a real photo, uploaded
 * through the actual dashboard, produces a product row whose image_url
 * is a genuinely loadable public image. Getting there took six distinct
 * real bugs, each found live against production and confirmed fixed by
 * watching the actual error change to a different one -- not guessed,
 * not assumed:
 * (1) `ensureConfigured()` fired its async reconfiguration without
 * awaiting it, and its caller didn't await it either -- a race against
 * unpdf's own default resolution (triggered elsewhere by
 * `lib/file-ingestion.ts`'s plain-text extraction), producing a fake
 * "API version does not match the Worker version" error; (2)
 * `pdfjs-dist`/`unpdf` needed `serverExternalPackages` (next.config.ts),
 * same class of problem `@napi-rs/canvas` already had; (3) pdf.js's
 * `GlobalWorkerOptions.workerSrc` needed to be set explicitly, which
 * itself needed `process.cwd()` + plain path joining, not
 * `require.resolve`/`import.meta.resolve` -- both returned
 * bundler-internal values, not real filesystem paths, from this
 * still-Turbopack-bundled file; (4) `Uint8Array.prototype.toHex()` and
 * (5) `Map.prototype.getOrInsert(Computed)()` are both real JS
 * language features pdf.js 6.x uses internally that only shipped
 * unflagged in Node.js 25 and 26 respectively (confirmed against
 * Node's own release notes) -- this Vercel project runs Node 24 LTS,
 * so both are polyfilled above, each a no-op the moment the deployed
 * runtime's own native version exists (see each polyfill's own doc
 * comment for why downgrading `pdfjs-dist` to dodge these was rejected
 * -- npm audit GHSA-hq66-cqwq-w95j makes anything below 6.2.108 a real
 * vulnerability, and 6.2.108 itself still needs the Map polyfill); (6)
 * this file used to call `await import("pdfjs-dist")` directly, before
 * `configureUnPDF()` -- breaking unpdf's own internal safety order
 * (its `stubBrowserGlobals()` installs a `DOMMatrix` stub pdf.js needs
 * just to be imported, and must run first) -- fixed by letting
 * `configureUnPDF()` do the importing and fetching the resolved module
 * afterward via `getResolvedPDFJS()`.
 *
 * Every call site still treats a render failure as non-fatal (corrupt
 * page, an environment regression, etc.): a product/service extracted
 * from this page still gets created, just without a photo.
 */
let configured: Promise<void> | null = null;
async function ensureConfigured(): Promise<void> {
  if (!configured) {
    configured = (async () => {
      ensureUint8ArrayToHexPolyfill();
      ensureMapUpsertPolyfill();
      // A fifth real bug: this used to call `await import("pdfjs-dist")`
      // directly, *before* configureUnPDF() -- which broke unpdf's own
      // internal safety order. unpdf's resolvePDFJSImport() calls its
      // stubBrowserGlobals() (installing a minimal DOMMatrix stub pdf.js
      // needs just to be imported, since pdf.js references it at module
      // -evaluation time, not only when actually rendering) *before* it
      // imports pdfjs-dist itself. Importing pdfjs-dist myself first
      // skipped that stub entirely, producing "DOMMatrix is not defined"
      // -- confirmed live. Letting configureUnPDF() do the importing (via
      // the resolver function) preserves unpdf's intended order; the
      // resolved module is fetched afterward via getResolvedPDFJS() to
      // set workerSrc on it, not re-imported.
      await configureUnPDF({ pdfjs: () => import("pdfjs-dist") });
      const pdfjsModule = await getResolvedPDFJS();
      const workerSrc = resolvePdfWorkerSrc();
      if (workerSrc) {
        pdfjsModule.GlobalWorkerOptions.workerSrc = workerSrc;
      }
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
