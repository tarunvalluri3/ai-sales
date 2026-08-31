import "server-only";
import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * No real input -- the model only ever needs to signal "list everything,"
 * never a filter. An empty object schema (rather than no schema at all)
 * keeps this tool shaped the same way as every other bindTools() entry in
 * this codebase (check_product_details, check_faq_topic, request_callback).
 */
export const ListOfferingsInputSchema = z.object({});

/**
 * Shaped for `bindTools()`, same convention as `checkProductDetailsTool`.
 */
export const listOfferingsTool = {
  name: "list_products_and_services",
  description:
    "Returns the full list of this business's products and services (name, short description, price) directly from the live catalog. Use this for a broad question like 'what do you offer', 'list all your services', or 'what products do you have' -- as opposed to check_product_details, which looks up one specific named item.",
  schema: ListOfferingsInputSchema,
};

export type OfferingSummary = {
  type: "product" | "service";
  name: string;
  description: string | null;
  price: string | null;
};

export type ListOfferingsResult =
  | { found: true; offerings: OfferingSummary[] }
  | { found: false; reason: "none_found" | "lookup_failed" };

/**
 * Authorized executor for the `list_products_and_services` tool.
 * `businessId` comes from `askSalesEmployee`'s own already-trusted
 * parameter, never from model input -- same tenant boundary as every
 * other tool in this directory (docs/security.md §1, §8, §9).
 *
 * Capped at 30 rows per table -- plenty for any real catalog at this
 * product's current scale, and keeps a single tool result bounded rather
 * than growing unbounded with catalog size.
 */
const MAX_OFFERINGS_PER_TABLE = 30;

export async function executeListOfferings(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ListOfferingsResult> {
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("name, description, price")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(MAX_OFFERINGS_PER_TABLE);

  if (productError) {
    logEvent("tool_invoked", businessId, { tool: "list_products_and_services", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  const { data: services, error: serviceError } = await supabase
    .from("services")
    .select("name, description, price")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(MAX_OFFERINGS_PER_TABLE);

  if (serviceError) {
    logEvent("tool_invoked", businessId, { tool: "list_products_and_services", result: "lookup_failed" }, "error");
    return { found: false, reason: "lookup_failed" };
  }

  const offerings: OfferingSummary[] = [
    ...products.map((product) => ({ type: "product" as const, name: product.name, description: product.description, price: product.price })),
    ...services.map((service) => ({ type: "service" as const, name: service.name, description: service.description, price: service.price })),
  ];

  if (offerings.length === 0) {
    logEvent("tool_invoked", businessId, { tool: "list_products_and_services", result: "none_found" });
    return { found: false, reason: "none_found" };
  }

  logEvent("tool_invoked", businessId, { tool: "list_products_and_services", result: "found" });
  return { found: true, offerings };
}
