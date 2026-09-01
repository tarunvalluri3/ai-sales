import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/sql-escape";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Phase B1 (STATE.md, "AI sales agent, not chatbot"): a budget/category-
 * aware alternative to list_products_and_services, only bound for
 * businesses whose ai_conversion_goal is 'recommend_products'
 * (lib/rag.ts). Filtering/sorting happens in this function, not via a
 * dynamic PostgREST `.or()` string (no risk of malformed filter syntax
 * from an AI-supplied budget number) -- fetch each table's approved rows,
 * filter/sort in memory, since a single business's catalog is small
 * enough that this is simpler and safer than building a filter string.
 */
export const RecommendProductsInputSchema = z.object({
  needs: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("A short summary of what the prospect said they need -- used for logging only, not as a filter."),
  // .min(0), not .positive() -- .positive() emits an "exclusiveMinimum"
  // JSON Schema keyword that Gemini's function-declaration parser rejects
  // outright ("Unknown name \"exclusiveMinimum\"... Cannot find field"),
  // confirmed via a real 400 from the live API, not assumed. `.min(0)`
  // emits "minimum" instead, which Gemini does support.
  maxBudget: z
    .number()
    .min(0)
    .nullable()
    .describe("The prospect's stated budget ceiling, if they gave one. Null if no budget was mentioned."),
  category: z
    .string()
    .trim()
    .max(60)
    .nullable()
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

  const { maxBudget, category } = parsed.data;

  try {
    const [productRows, serviceRows] = await Promise.all([
      queryTable(supabase, "products", businessId, category),
      queryTable(supabase, "services", businessId, category),
    ]);

    const combined: (CatalogRow & { type: "product" | "service" })[] = [
      ...productRows.map((row) => ({ ...row, type: "product" as const })),
      ...serviceRows.map((row) => ({ ...row, type: "service" as const })),
    ];

    const withinBudget = combined.filter(
      (row) => maxBudget === null || row.price_amount === null || row.price_amount <= maxBudget,
    );

    withinBudget.sort((a, b) => {
      const aPrice = a.price_amount ?? Number.POSITIVE_INFINITY;
      const bPrice = b.price_amount ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    });

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
  } catch {
    logEvent("tool_invoked", businessId, { tool: "recommend_products", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }
}
