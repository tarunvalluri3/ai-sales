import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { renderPdfPageToPng } from "@/lib/pdf-page-images";

const BUSINESS_ID = "96870a7a-62c2-42d0-b1aa-3995802df8aa";
const STORAGE_PATH = "96870a7a-62c2-42d0-b1aa-3995802df8aa/7207fc3a-ec53-4e6f-823b-3d172d9e1551/catalog-test.pdf";

export async function GET() {
  const diag: Record<string, unknown> = {};
  try {
    diag.importMetaUrl = import.meta.url;
    const req = createRequire(import.meta.url);
    const resolved = req.resolve("pdfjs-dist/build/pdf.worker.mjs");
    diag.resolvedType = typeof resolved;
    diag.resolvedValue = resolved;
  } catch (error) {
    diag.resolveError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  const supabase = createServiceSupabaseClient();
  const { data: pdfFile, error: downloadError } = await supabase.storage.from("knowledge-files").download(STORAGE_PATH);
  if (downloadError || !pdfFile) {
    return NextResponse.json({ step: "download", error: downloadError?.message ?? "no file" });
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

  let caughtError: unknown = null;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    caughtError = args;
    originalConsoleError(...args);
  };

  try {
    const png = await renderPdfPageToPng(pdfBytes, 1, BUSINESS_ID);
    return NextResponse.json({
      step: "render",
      success: png !== null,
      pngBytes: png?.length ?? 0,
      caughtConsoleError: caughtError,
      diag,
    });
  } catch (error) {
    return NextResponse.json({
      step: "render-threw",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
      diag,
    });
  } finally {
    console.error = originalConsoleError;
  }
}
