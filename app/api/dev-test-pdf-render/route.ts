import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { renderPdfPageToPng } from "@/lib/pdf-page-images";

const BUSINESS_ID = "96870a7a-62c2-42d0-b1aa-3995802df8aa";
const STORAGE_PATH = "96870a7a-62c2-42d0-b1aa-3995802df8aa/7207fc3a-ec53-4e6f-823b-3d172d9e1551/catalog-test.pdf";

export async function GET() {
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
    });
  } catch (error) {
    return NextResponse.json({
      step: "render-threw",
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
  } finally {
    console.error = originalConsoleError;
  }
}
