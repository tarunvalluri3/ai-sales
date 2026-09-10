import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/sql-escape";
import { logEvent } from "@/lib/logger";
import { embedText } from "@/lib/embeddings";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Phase B1 (STATE.md, "AI sales agent, not chatbot"): a budget/category-
 * aware alternative to list_products_and_services, only bound for
 * businesses whose recommend_products_enabled is true (lib/rag.ts).
 * Budget/category filtering happens in this function, not via a
 * dynamic PostgREST `.or()` string (no risk of malformed filter syntax
 * from an AI-supplied budget number).
 *
 * `needs` is embedded once (lib/embeddings.ts) and ranked against each
 * approved catalog row's own embedding (match_products/match_services,
 * supabase/migrations/20260910020000_..., computed at save/approve time
 * in lib/products.ts / lib/services.ts -- never on this request path) so
 * a recommendation actually reflects what the prospect said, not just a
 * budget/category cutoff. On any embedding or RPC failure (rate limit,
 * transient outage), falls back to the prior budget/category-only lookup
 * (`queryTable` below) so a transient issue degrades gracefully instead
 * of a hard failure.
 */
export const RecommendProductsInputSchema = z.object({
  needs: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("A short summary of what the prospect said they need -- used to semantically match the best-fitting products/services, not just as a log."),
  // .min(0), not .positive() -- .positive() emits an "exclusiveMinimum"
  // JSON Schema keyword that Gemini's function-declaration parser rejects
  // outright ("Unknown name \"exclusiveMinimum\"... Cannot find field"),
  // confirmed via a real 400 from the live API, not assumed. `.min(0)`
  // emits "minimum" instead, which Gemini does support.
  // .nullable().optional(), not just .nullable() -- Gemini's function
  // calling sometimes omits an argument key entirely instead of emitting
  // an explicit `null` for it, which a bare .nullable() schema rejects as
  // undefined (the root cause of STATE.md's "occasional invalid_input
  // flake" on this tool). .optional() tolerates the omitted key too;
  // callers below normalize the resulting `| undefined` to `null`.
  maxBudget: z
    .number()
    .min(0)
    .nullable()
    .optional()
    .describe("The prospect's stated budget ceiling, if they gave one. Null if no budget was mentioned."),
  category: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .describe("A specific category to filter to, if the prospect named one (e.g. 'sofas', 'web design'). Null otherwise."),
});

export const recommendProductsTool = {
  name: "recommend_products",
  description:
    "Returns this business's own products/services that best match a prospect's stated need, optionally filtered by budget and category, each with its image (when the business has set one) and price. Use this instead of list_products_and_services once you understand what the prospect wants and a budget or category should narrow the results.",
  schema: RecommendProductsInputSchema,
};

export type RecommendedItem = {
  type: "product" | "service";
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  priceDisplay: string | null;
  priceAmount: number | null;
  imageUrl: string | null;
};

export type RecommendProductsResult =
  | { found: true; items: RecommendedItem[] }
  | { found: false; reason: "none_found" | "lookup_failed" | "invalid_input" };

const MAX_RESULTS = 6;

type CatalogRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  // `price` is a Postgres `numeric(12,2)` column (products/services migrations)
  // despite lib/supabase/types.ts's pre-existing `string | null` Product/Service
  // type -- supabase-js returns it as a JS number at runtime, confirmed live
  // (a request against this exact column returned an unquoted number, not a
  // string). Typed loosely here and coerced to a real string in the mapper
  // below, so RecommendedItem.priceDisplay's own `string | null` contract
  // actually holds at runtime, not just at the type level.
  price: string | number | null;
  price_amount: number | null;
  image_url: string | null;
};

async function queryTable(
  supabase: SupabaseClient,
  table: "products" | "services",
  businessId: string,
  category: string | null,
): Promise<CatalogRow[]> {
  let query = supabase
    .from(table)
    .select("id, name, description, category, price, price_amount, image_url")
    .eq("business_id", businessId)
    .eq("status", "approved");

  if (category) {
    query = query.ilike("category", `%${escapeLikePattern(category)}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Generous candidate pool per table -- narrowed by budget/category below, then capped to MAX_RESULTS. */
const MATCH_COUNT = 20;

type MatchRow = CatalogRow & { similarity: number };

async function matchTable(
  supabase: SupabaseClient,
  fn: "match_products" | "match_services",
  businessId: string,
  queryEmbedding: number[],
): Promise<MatchRow[]> {
  const { data, error } = await supabase.rpc(fn, {
    p_business_id: businessId,
    p_query_embedding: queryEmbedding,
    p_match_count: MATCH_COUNT,
  });
  if (error) {
    throw error;
  }
  return data ?? [];
}

function matchesCategory(row: CatalogRow, category: string): boolean {
  return row.category !== null && row.category.toLowerCase().includes(category.toLowerCase());
}

/**
 * Authorized executor for the `recommend_products` tool. `businessId`
 * comes from `askSalesEmployee`'s own already-trusted parameter, never
 * from model input -- same tenant boundary as every other tool in this
 * directory (docs/security.md §1, §8, §9).
 */
export async function executeRecommendProducts(
  supabase: SupabaseClient,
  businessId: string,
  rawArgs: unknown,
): Promise<RecommendProductsResult> {
  const parsed = RecommendProductsInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "recommend_products", result: "invalid_input" }, "error");
    return { found: false, reason: "invalid_input" };
  }

  const maxBudget = parsed.data.maxBudget ?? null;
  const category = parsed.data.category ?? null;

  let combined: (CatalogRow & { type: "product" | "service"; similarity: number | null })[];
  let usedSemanticMatch: boolean;

  try {
    const queryEmbedding = await embedText(parsed.data.needs);
    const [productRows, serviceRows] = await Promise.all([
      matchTable(supabase, "match_products", businessId, queryEmbedding),
      matchTable(supabase, "match_services", businessId, queryEmbedding),
    ]);

    combined = [
      ...productRows.map((row) => ({ ...row, type: "product" as const })),
      ...serviceRows.map((row) => ({ ...row, type: "service" as const })),
    ];
    usedSemanticMatch = true;
  } catch {
    // Embedding/RPC failure (rate limit, transient outage, or nothing in
    // the catalog has an embedding yet) -- degrade to the prior
    // budget/category-only lookup rather than a hard failure.
    try {
      const [productRows, serviceRows] = await Promise.all([
        queryTable(supabase, "products", businessId, category),
        queryTable(supabase, "services", businessId, category),
      ]);
      combined = [
        ...productRows.map((row) => ({ ...row, type: "product" as const, similarity: null })),
        ...serviceRows.map((row) => ({ ...row, type: "service" as const, similarity: null })),
      ];
      usedSemanticMatch = false;
    } catch {
      logEvent("tool_invoked", businessId, { tool: "recommend_products", result: "lookup_failed" }, "error");
      return { found: false, reason: "lookup_failed" };
    }
  }

  // The semantic path fetches a candidate pool by similarity across the
  // whole catalog (the RPC has no category parameter) -- category is
  // applied here as the same case-insensitive substring match the
  // fallback path's `ilike` performs in the database.
  const categoryFiltered = category ? combined.filter((row) => matchesCategory(row, category)) : combined;

  const withinBudget = categoryFiltered.filter(
    (row) => maxBudget === null || row.price_amount === null || row.price_amount <= maxBudget,
  );

  if (usedSemanticMatch) {
    withinBudget.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  } else {
    withinBudget.sort((a, b) => {
      const aPrice = a.price_amount ?? Number.POSITIVE_INFINITY;
      const bPrice = b.price_amount ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    });
  }

  const items: RecommendedItem[] = withinBudget.slice(0, MAX_RESULTS).map((row) => ({
    type: row.type,
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceDisplay: row.price != null ? String(row.price) : null,
    priceAmount: row.price_amount,
    imageUrl: row.image_url,
  }));

  if (items.length === 0) {
    logEvent("tool_invoked", businessId, { tool: "recommend_products", result: "none_found" });
    return { found: false, reason: "none_found" };
  }

  logEvent("tool_invoked", businessId, { tool: "recommend_products", result: "found" });
  return { found: true, items };
}
