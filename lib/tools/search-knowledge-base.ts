import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchKnowledgeChunks } from "@/lib/retrieval";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Stage 3 (STATE.md): an on-demand, broader search over a business's full
 * published knowledge base -- the deliberate fallback for whatever Stage
 * 2's extraction doesn't turn into a clean product/service/FAQ row (a
 * general policy, an about-us paragraph, a warranty term, anything
 * stated in a document but not shaped as a discrete catalog item). The
 * passive per-turn retrieval in `lib/rag.ts`'s `KnowledgeRetriever`
 * already runs automatically every turn against the prospect's exact
 * question; this tool lets the model run a second, explicit search --
 * with a reformulated or broader query -- only when that passive pass
 * and the other tools didn't cover the question, rather than replacing
 * either.
 */

export const SearchKnowledgeBaseInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe(
      "A specific topic or question to search this business's full knowledge base for -- can be a reformulated or broader version of the prospect's question if the exact wording didn't surface anything useful.",
    ),
});

/**
 * Shaped for `bindTools()`, same convention as this directory's other tools.
 */
export const searchKnowledgeBaseTool = {
  name: "search_knowledge_base",
  description:
    "Searches this business's full knowledge base (every published knowledge document, not just products/services/FAQs) for content related to a topic. Use this only after check_product_details, check_faq_topic, and list_products_and_services (as applicable) haven't answered the question and the reference context above doesn't seem to cover it either -- for general information that may be stated somewhere in the business's documents but isn't shaped as a discrete product, service, or FAQ (e.g. a policy, a warranty term, an about-us fact).",
  schema: SearchKnowledgeBaseInputSchema,
};

export type SearchKnowledgeBasePassage = {
  chunkId: string;
  content: string;
};

export type SearchKnowledgeBaseResult =
  | { found: true; passages: SearchKnowledgeBasePassage[] }
  | { found: false; reason: "none_found" | "invalid_input" | "lookup_failed" };

/** Broader than the passive per-turn retrieval's default of 5 -- this is the deliberate "dig deeper" pass, so it's allowed to pull more candidates. */
const SEARCH_KNOWLEDGE_BASE_LIMIT = 8;

/**
 * Authorized executor for the `search_knowledge_base` tool. `businessId`
 * comes from `askSalesEmployee`'s own already-trusted parameter -- never
 * from `rawArgs` -- same tenant boundary as every other tool in this
 * directory (docs/security.md §1, §8, §9).
 *
 * Never throws -- `searchKnowledgeChunks` can throw (`lib/retrieval.ts`),
 * so it's wrapped here the same way every other tool executor in this
 * codebase guarantees a structured result instead of an unhandled
 * rejection.
 */
export async function executeSearchKnowledgeBase(
  supabase: SupabaseClient,
  businessId: string,
  rawArgs: unknown,
): Promise<SearchKnowledgeBaseResult> {
  const parsed = SearchKnowledgeBaseInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "search_knowledge_base", result: "invalid_input" }, "error");
    return { found: false, reason: "invalid_input" };
  }

  let results: Awaited<ReturnType<typeof searchKnowledgeChunks>>;
  try {
    results = await searchKnowledgeChunks(supabase, businessId, parsed.data.query, SEARCH_KNOWLEDGE_BASE_LIMIT);
  } catch {
    logEvent("tool_invoked", businessId, { tool: "search_knowledge_base", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  if (results.length === 0) {
    logEvent("tool_invoked", businessId, { tool: "search_knowledge_base", result: "none_found" });
    return { found: false, reason: "none_found" };
  }

  logEvent("tool_invoked", businessId, { tool: "search_knowledge_base", result: "found" });
  return { found: true, passages: results.map((result) => ({ chunkId: result.id, content: result.content })) };
}
