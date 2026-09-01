import "server-only";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { getChatModel } from "@/lib/rag";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { renderPdfPageToPng } from "@/lib/pdf-page-images";
import { logEvent } from "@/lib/logger";

/**
 * Stage 2 of "generalize the AI's business understanding" (STATE.md): pulls
 * structured products/services/FAQs out of a knowledge document's content,
 * regardless of source type (manual/file/url), so a business that only
 * ever adds a URL or file still gets the same reliable, tool-backed
 * answering as one that fills in the Products/Services/FAQs pages by hand.
 *
 * Every extracted row is inserted as `status: 'draft'` -- deliberately
 * never synced into a knowledge document at insert time, so an unreviewed
 * extraction can never become retrievable via RAG or answerable via an AI
 * tool before a human approves it on the corresponding dashboard page
 * (AGENTS.md rule 4). Runs off the request path via `after()` (see
 * dashboard/knowledge/actions.ts), so it uses the service-role client the
 * same way lib/ingestion-queue.ts does for its own detached background
 * work -- there is no Clerk session to key an authenticated client off of
 * once the triggering request has already responded.
 */

const ExtractedProductOrServiceSchema = z.object({
  name: z.string().describe("The exact product or service name as stated in the document."),
  description: z.string().nullable().describe("A short description, only if the document actually describes it -- otherwise null."),
  price: z
    .string()
    .nullable()
    .describe("The exact price as a plain number, e.g. '19.99' -- null if the document doesn't state one, or states it ambiguously (e.g. 'starting at $499/mo')."),
  category: z.string().nullable().describe("A short category/section name if the document groups items that way (e.g. 'Sofas', 'Web Design') -- otherwise null."),
  // .min(1), not .positive() -- .positive() emits an "exclusiveMinimum"
  // JSON Schema keyword Gemini's structured-output schema parser rejects
  // outright (confirmed via a real 400 from the live API testing this
  // exact schema, not assumed -- same root cause as
  // lib/tools/recommend-products.ts's maxBudget field).
  sourcePageNumber: z
    .number()
    .int()
    .min(1)
    .nullable()
    .describe(
      "PDF only: the 1-indexed page number this item's photo/main description appears on, if there's a real, specific photo of this item on that page. Null if this isn't a PDF, or the document has no photo for this item.",
    ),
});

const ExtractedFaqSchema = z.object({
  question: z.string().describe("The question, as stated or clearly implied by the document."),
  answer: z.string().describe("The answer, using only what the document actually says."),
});

const ExtractionResultSchema = z.object({
  products: z.array(ExtractedProductOrServiceSchema).describe("Distinct physical or digital products this document explicitly describes for sale. Empty array if none."),
  services: z.array(ExtractedProductOrServiceSchema).describe("Distinct services this document explicitly describes offering. Empty array if none."),
  faqs: z.array(ExtractedFaqSchema).describe("Distinct question-and-answer pairs this document explicitly supports. Empty array if none."),
});

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

const EXTRACTION_PROMPT = `You extract structured catalog data from a single business knowledge document, for a human to review before it's used.

Rules:
- Only extract what the document explicitly states. Never infer, guess, or invent a product, service, FAQ, or detail that isn't actually there.
- If a price is ambiguous, a range, or conditional (e.g. "starting at $499/mo", "contact us for pricing"), leave price null rather than guessing a specific figure.
- If the document describes the same offering more than once, extract it once.
- If the document contains no products, no services, or no FAQs, return an empty array for that field -- do not force an extraction.
- Leave category null unless the document itself groups items into named sections/categories.
- Leave sourcePageNumber null -- this document is plain text, not a PDF you can see page images of.

Document title: {title}

Document content:
{content}`;

/**
 * Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
 * photos): the multimodal variant, sent the actual PDF (not just its
 * extracted text) so Gemini can identify which page a genuine product
 * photo is on -- lib/pdf-page-images.ts then renders just those specific
 * pages, not every page, keeping this bounded and cheap.
 */
const PDF_EXTRACTION_PROMPT = `You extract structured catalog data from a single business's PDF catalog, for a human to review before it's used. You can see every page of the PDF directly, including any photos.

Rules:
- Only extract what the PDF explicitly shows or states. Never infer, guess, or invent a product, service, FAQ, price, or detail that isn't actually there.
- If a price is ambiguous, a range, or conditional (e.g. "starting at $499/mo", "contact us for pricing"), leave price null rather than guessing a specific figure.
- If the PDF describes the same offering more than once, extract it once.
- If the PDF contains no products, no services, or no FAQs, return an empty array for that field -- do not force an extraction.
- Leave category null unless the PDF itself groups items into named sections/categories.
- Set sourcePageNumber to the 1-indexed page number of a genuine, specific photo of that exact item, if the PDF has one. Leave it null if there's no photo for that item, or only a generic/unrelated image on that page.

Document title: {title}`;

/** Numeric(12,2)-compatible, matching lib/schemas/catalog.ts's catalogPriceSchema. Defensive: even though the prompt asks for this shape, a model response is untrusted input and must be re-validated before it reaches a numeric column. */
function sanitizePrice(price: string | null): string | null {
  if (!price) return null;
  const trimmed = price.trim();
  return /^\d+(\.\d{1,2})?$/.test(trimmed) ? trimmed : null;
}

function normalizeForDedup(value: string): string {
  return value.trim().toLowerCase();
}

async function extractStructuredCatalog(title: string, content: string): Promise<ExtractionResult> {
  const model = getChatModel().withStructuredOutput(ExtractionResultSchema, { name: "CatalogExtraction" });
  const prompt = EXTRACTION_PROMPT.replace("{title}", title).replace("{content}", content);
  return model.invoke([new HumanMessage(prompt)]);
}

/** `pdfBase64` is the raw PDF bytes, base64-encoded, sent as a native multimodal file part -- exact shape confirmed against the installed @langchain/google-genai package's own documented example ("Document Messages"), not assumed from memory. */
async function extractStructuredCatalogFromPdf(title: string, pdfBase64: string): Promise<ExtractionResult> {
  const model = getChatModel().withStructuredOutput(ExtractionResultSchema, { name: "CatalogExtraction" });
  const prompt = PDF_EXTRACTION_PROMPT.replace("{title}", title);
  return model.invoke([
    ["user", [
      { type: "application/pdf", data: pdfBase64 },
      { type: "text", text: prompt },
    ]],
  ]);
}

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;
type ExtractedItem = z.infer<typeof ExtractedProductOrServiceSchema>;

/**
 * Shared insert step for both the text-only and PDF extraction entry
 * points below -- dedup, sanitization, and the insert calls themselves
 * are identical either way; only how `result` and `imageUrlByPage` were
 * produced differs. `imageUrlByPage` is empty for the text-only path
 * (nothing to render a page image from).
 */
async function insertExtractionResult(
  supabase: ServiceSupabaseClient,
  businessId: string,
  documentId: string,
  result: ExtractionResult,
  imageUrlByPage: Map<number, string>,
): Promise<{ productsExtracted: number; servicesExtracted: number; faqsExtracted: number } | null> {
  const [existingProducts, existingServices, existingFaqs] = await Promise.all([
    supabase.from("products").select("name").eq("business_id", businessId),
    supabase.from("services").select("name").eq("business_id", businessId),
    supabase.from("faqs").select("question").eq("business_id", businessId),
  ]);

  const existingProductNames = new Set((existingProducts.data ?? []).map((row) => normalizeForDedup(row.name)));
  const existingServiceNames = new Set((existingServices.data ?? []).map((row) => normalizeForDedup(row.name)));
  const existingFaqQuestions = new Set((existingFaqs.data ?? []).map((row) => normalizeForDedup(row.question)));

  function imageUrlFor(item: ExtractedItem): string | null {
    return item.sourcePageNumber !== null ? (imageUrlByPage.get(item.sourcePageNumber) ?? null) : null;
  }

  const productsToInsert = result.products
    .filter((product) => !existingProductNames.has(normalizeForDedup(product.name)))
    .map((product) => ({
      business_id: businessId,
      name: product.name,
      description: product.description,
      price: sanitizePrice(product.price),
      category: product.category,
      image_url: imageUrlFor(product),
      status: "draft" as const,
      extracted_from_document_id: documentId,
    }));

  const servicesToInsert = result.services
    .filter((service) => !existingServiceNames.has(normalizeForDedup(service.name)))
    .map((service) => ({
      business_id: businessId,
      name: service.name,
      description: service.description,
      price: sanitizePrice(service.price),
      category: service.category,
      image_url: imageUrlFor(service),
      status: "draft" as const,
      extracted_from_document_id: documentId,
    }));

  const faqsToInsert = result.faqs
    .filter((faq) => !existingFaqQuestions.has(normalizeForDedup(faq.question)))
    .map((faq) => ({
      business_id: businessId,
      question: faq.question,
      answer: faq.answer,
      status: "draft" as const,
      extracted_from_document_id: documentId,
    }));

  const [productInsert, serviceInsert, faqInsert] = await Promise.all([
    productsToInsert.length > 0 ? supabase.from("products").insert(productsToInsert) : Promise.resolve({ error: null }),
    servicesToInsert.length > 0 ? supabase.from("services").insert(servicesToInsert) : Promise.resolve({ error: null }),
    faqsToInsert.length > 0 ? supabase.from("faqs").insert(faqsToInsert) : Promise.resolve({ error: null }),
  ]);

  if (productInsert.error || serviceInsert.error || faqInsert.error) {
    logEvent("knowledge_extraction_insert_failed", businessId, { documentId }, "error");
    return null;
  }

  return {
    productsExtracted: productsToInsert.length,
    servicesExtracted: servicesToInsert.length,
    faqsExtracted: faqsToInsert.length,
  };
}

/**
 * Extracts and inserts draft catalog rows for one knowledge document.
 * Never throws -- called from `after()`, detached from any request that
 * could report a failure back to a user, so a failure here is logged
 * (`knowledge_extraction_failed`) and otherwise swallowed rather than
 * left as an unhandled rejection.
 */
export async function extractCatalogFromDocument(
  businessId: string,
  documentId: string,
  title: string,
  content: string,
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  try {
    const result = await extractStructuredCatalog(title, content);
    const counts = await insertExtractionResult(supabase, businessId, documentId, result, new Map());
    if (!counts) return;

    logEvent("knowledge_extraction_succeeded", businessId, { documentId, ...counts });
  } catch {
    logEvent("knowledge_extraction_failed", businessId, { documentId }, "error");
  }
}

const MAX_PDF_PAGES_TO_RENDER = 20;

/**
 * Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
 * photos): the PDF-sourced sibling of `extractCatalogFromDocument`.
 * Downloads the original PDF from Storage (only present if its upload
 * succeeded -- see lib/file-ingestion.ts), sends it to Gemini directly so
 * it can identify which page (if any) has a genuine photo of each item,
 * then renders and uploads just those specific pages (never every page)
 * to the public `catalog-images` bucket. Page rendering is best-effort
 * per lib/pdf-page-images.ts's own doc comment -- a render failure for
 * one page simply leaves that item with no photo, it never fails the
 * whole extraction. Falls back to the text-only path entirely if the
 * PDF can't be downloaded (e.g. its Storage upload failed at ingestion
 * time), so this document still gets normal catalog extraction.
 */
export async function extractCatalogFromPdfDocument(
  businessId: string,
  documentId: string,
  title: string,
  content: string,
  storagePath: string,
): Promise<void> {
  const supabase = createServiceSupabaseClient();

  try {
    const { data: pdfFile, error: downloadError } = await supabase.storage.from("knowledge-files").download(storagePath);
    if (downloadError || !pdfFile) {
      logEvent("pdf_catalog_extraction_download_failed", businessId, { documentId }, "error");
      await extractCatalogFromDocument(businessId, documentId, title, content);
      return;
    }

    const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const result = await extractStructuredCatalogFromPdf(title, pdfBase64);

    const pageNumbers = [
      ...new Set(
        [...result.products, ...result.services]
          .map((item) => item.sourcePageNumber)
          .filter((pageNumber): pageNumber is number => pageNumber !== null),
      ),
    ].slice(0, MAX_PDF_PAGES_TO_RENDER);

    const imageUrlByPage = new Map<number, string>();
    for (const pageNumber of pageNumbers) {
      const png = await renderPdfPageToPng(pdfBytes, pageNumber, businessId);
      if (!png) continue;

      const imagePath = `${businessId}/${documentId}/pages/${pageNumber}.png`;
      const { error: uploadError } = await supabase.storage
        .from("catalog-images")
        .upload(imagePath, png, { contentType: "image/png", upsert: true });
      if (uploadError) continue;

      const { data: publicUrlData } = supabase.storage.from("catalog-images").getPublicUrl(imagePath);
      imageUrlByPage.set(pageNumber, publicUrlData.publicUrl);
    }

    const counts = await insertExtractionResult(supabase, businessId, documentId, result, imageUrlByPage);
    if (!counts) return;

    logEvent("knowledge_extraction_succeeded", businessId, {
      documentId,
      ...counts,
      pagesRendered: imageUrlByPage.size,
    });
  } catch {
    logEvent("knowledge_extraction_failed", businessId, { documentId }, "error");
  }
}
