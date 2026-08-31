import "server-only";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { getChatModel } from "@/lib/rag";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
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

Document title: {title}

Document content:
{content}`;

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

    const [existingProducts, existingServices, existingFaqs] = await Promise.all([
      supabase.from("products").select("name").eq("business_id", businessId),
      supabase.from("services").select("name").eq("business_id", businessId),
      supabase.from("faqs").select("question").eq("business_id", businessId),
    ]);

    const existingProductNames = new Set((existingProducts.data ?? []).map((row) => normalizeForDedup(row.name)));
    const existingServiceNames = new Set((existingServices.data ?? []).map((row) => normalizeForDedup(row.name)));
    const existingFaqQuestions = new Set((existingFaqs.data ?? []).map((row) => normalizeForDedup(row.question)));

    const productsToInsert = result.products
      .filter((product) => !existingProductNames.has(normalizeForDedup(product.name)))
      .map((product) => ({
        business_id: businessId,
        name: product.name,
        description: product.description,
        price: sanitizePrice(product.price),
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
      return;
    }

    logEvent("knowledge_extraction_succeeded", businessId, {
      documentId,
      productsExtracted: productsToInsert.length,
      servicesExtracted: servicesToInsert.length,
      faqsExtracted: faqsToInsert.length,
    });
  } catch {
    logEvent("knowledge_extraction_failed", businessId, { documentId }, "error");
  }
}
