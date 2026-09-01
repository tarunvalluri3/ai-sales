import "server-only";
import { z } from "zod";
import { getChatModel } from "@/lib/rag";
import { listProductsForBusiness } from "@/lib/products";
import { listServicesForBusiness } from "@/lib/services";
import { listFaqsForBusiness } from "@/lib/faqs";
import { AppError } from "@/lib/errors";

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 6;
const MAX_CATALOG_LINES = 40;

/**
 * Thrown when a business has no products, services, or FAQs to draw
 * from yet -- generating "suggested questions" with nothing but a
 * business name/description would risk inventing specifics about
 * offerings that don't exist (AGENTS.md §3 rule 4's spirit, even though
 * these are prospect *questions*, not answers). The caller should show
 * a message pointing the owner at Products/Services/FAQs first.
 */
export class NoBusinessContentError extends Error {
  constructor() {
    super("Add at least one product, service, or FAQ before generating suggested questions.");
    this.name = "NoBusinessContentError";
  }
}

const SuggestedQuestionsSchema = z.object({
  questions: z
    .array(z.string().trim().min(1).max(120))
    .min(MIN_QUESTIONS)
    .max(MAX_QUESTIONS)
    .describe("Short, natural-sounding questions a real prospect might type into this business's chat widget."),
});

function buildCatalogSummary(
  products: { name: string; description: string | null }[],
  services: { name: string; description: string | null }[],
  faqs: { question: string }[],
): string {
  const lines = [
    ...products.map((p) => `Product: ${p.name}${p.description ? ` -- ${p.description}` : ""}`),
    ...services.map((s) => `Service: ${s.name}${s.description ? ` -- ${s.description}` : ""}`),
    ...faqs.map((f) => `Existing FAQ topic: ${f.question}`),
  ];
  return lines.slice(0, MAX_CATALOG_LINES).join("\n");
}

/**
 * Generates candidate prefilled questions for the widget's greeting
 * screen (Phase 25e), grounded only in this business's own catalog --
 * never persisted here. The dashboard's own review/edit/save step
 * (widget-settings/actions.ts's saveSuggestedQuestionsAction) is what
 * actually makes any of this live; this function only proposes.
 * `businessId` must come from `requireBusinessContext()`.
 */
export async function generateSuggestedQuestions(
  businessId: string,
  businessName: string,
  businessDescription: string | null,
): Promise<string[]> {
  const [products, services, faqs] = await Promise.all([
    listProductsForBusiness(businessId),
    listServicesForBusiness(businessId),
    listFaqsForBusiness(businessId),
  ]);

  if (products.length === 0 && services.length === 0 && faqs.length === 0) {
    throw new NoBusinessContentError();
  }

  const catalogSummary = buildCatalogSummary(products, services, faqs);

  const prompt = `You are helping ${businessName} configure the prefilled question chips shown on its AI chat widget's greeting screen -- the first thing a website visitor sees, before they've typed anything.

${businessDescription ? `Business description: ${businessDescription}\n\n` : ""}Here is this business's actual catalog (nothing outside this list is confirmed to exist -- do not invent products, services, prices, or policies not shown here):
${catalogSummary}

Write ${MIN_QUESTIONS}-${MAX_QUESTIONS} short questions a real prospective customer might type into the chat, phrased the way a person actually asks (casual, specific, under 12 words where possible) -- not a restated product name. Cover a spread of what's in the catalog above rather than several near-duplicate questions about the same one item. Every question must be answerable from the catalog shown above.`;

  const model = getChatModel().withStructuredOutput(SuggestedQuestionsSchema, {
    name: "SuggestedQuestions",
  });

  try {
    const result = await model.invoke([["human", prompt]]);
    return result.questions.slice(0, MAX_QUESTIONS);
  } catch (error) {
    throw new AppError(
      "Something went wrong generating suggested questions. Please try again.",
      "generateSuggestedQuestions failed",
      error,
    );
  }
}
