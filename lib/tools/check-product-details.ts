import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/sql-escape";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export const CheckProductDetailsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("The exact product or service name to look up, as the prospect referred to it."),
});

/**
 * Shaped for `bindTools()` -- a plain `{ name, description, schema }` object,
 * per the installed `@langchain/google-genai`'s documented example (not the
 * `tool()` helper, not a class).
 */
export const checkProductDetailsTool = {
  name: "check_product_details",
  description:
    "Does an exact lookup by name against this business's real product/service catalog. Use this when a prospect asks about a specific named product or service and precise, current price or description matters -- it queries the live catalog directly, rather than relying only on retrieved reference context.",
  schema: CheckProductDetailsInputSchema,
};

export type CheckProductDetailsResult =
  | { found: true; type: "product" | "service"; name: string; description: string | null; price: string | null }
  | { found: false; reason: "not_found" | "invalid_input" | "lookup_failed" };

/**
 * Authorized executor for the `check_product_details` tool. `businessId`
 * comes from `askSalesEmployee`'s own already-trusted parameter -- never
 * from `rawArgs`, and not part of `CheckProductDetailsInputSchema` -- so
 * this tool is structurally incapable of reading another business's row
 * regardless of what the model asks for (docs/security.md §1, §8, §9).
 *
 * Re-validates `rawArgs` even though `bindTools`' schema already
 * constrains what the model can send (defense in depth, docs/security.md
 * §8). Never throws -- every outcome, including a DB failure, comes back
 * as a structured `CheckProductDetailsResult` so a tool failure can't take
 * down the whole `askSalesEmployee` call.
 */
export async function executeCheckProductDetails(
  supabase: SupabaseClient,
  businessId: string,
  rawArgs: unknown,
): Promise<CheckProductDetailsResult> {
  const parsed = CheckProductDetailsInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "invalid_input" }, "error");
    return { found: false, reason: "invalid_input" };
  }

  const { query } = parsed.data;

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("name, description, price")
    .eq("business_id", businessId)
    .ilike("name", escapeLikePattern(query))
    .maybeSingle();

  if (productError) {
    logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  if (product) {
    logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "found_product" });
    return { found: true, type: "product", name: product.name, description: product.description, price: product.price };
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("name, description, price")
    .eq("business_id", businessId)
    .ilike("name", escapeLikePattern(query))
    .maybeSingle();

  if (serviceError) {
    logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  if (service) {
    logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "found_service" });
    return { found: true, type: "service", name: service.name, description: service.description, price: service.price };
  }

  logEvent("tool_invoked", businessId, { tool: "check_product_details", result: "not_found" });
  return { found: false, reason: "not_found" };
}
