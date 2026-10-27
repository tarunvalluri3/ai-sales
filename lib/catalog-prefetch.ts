import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadOfferings, type OfferingSummary } from "@/lib/tools/list-offerings";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * A catalog this small is put in front of the model on every turn, so the
 * most common tool round trips (list_products_and_services for "what do you
 * offer", check_product_details for a named item -- 40 of the 54 one-tool
 * turns in the 2026-10-27 baseline) can be answered in one model call. Above
 * the limit nothing is injected and the tools work exactly as before: a big
 * catalog would cost prompt tokens on every turn, including the ones that
 * never mention it.
 */
export const CATALOG_PREFETCH_MAX_OFFERINGS = 8;
const MAX_DESCRIPTION_CHARS = 200;
/** Hard cap on the rendered block (~600 tokens); over it, inject nothing. */
const MAX_BLOCK_CHARS = 2400;

/**
 * The business's complete approved catalog if it is small enough to inject,
 * otherwise null (too big, empty, or a database error -- all "no prefetch",
 * never a failed turn). Tenant-scoped by `businessId` like every other read.
 */
export async function prefetchSmallCatalog(
  supabase: SupabaseClient,
  businessId: string,
): Promise<OfferingSummary[] | null> {
  // Kill switch (and the "before" arm of the latency measurement): set
  // CATALOG_PREFETCH=off to restore the tool-only behaviour without a revert.
  if (process.env.CATALOG_PREFETCH === "off") return null;
  try {
    const offerings = await loadOfferings(supabase, businessId);
    if (!offerings || offerings.length === 0 || offerings.length > CATALOG_PREFETCH_MAX_OFFERINGS) return null;
    return offerings;
  } catch {
    return null;
  }
}

/** Business-authored text: strip the characters that could forge a tag boundary and flatten whitespace. */
function clean(text: string, maxChars: number): string {
  return text.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/**
 * The catalog as a section of <retrieved_context>, so the existing rule that
 * everything inside that tag is data, never instructions, covers it. Returns
 * null when it would exceed the size cap.
 */
export function formatCatalogSection(offerings: OfferingSummary[]): string | null {
  const lines = offerings.map((offering) => {
    const price = offering.price ? ` | price: ${clean(String(offering.price), 40)}` : "";
    const description = offering.description ? ` | ${clean(offering.description, MAX_DESCRIPTION_CHARS)}` : "";
    return `- ${offering.type} "${clean(offering.name, 120)}"${price}${description}`;
  });
  const section = `Live catalog -- the COMPLETE list of this business's approved products and services, read just now from the same catalog that check_product_details and list_products_and_services read. A question about what is offered, or about a named item's price or description, is answered from this list directly; do not call those two tools for it.\n${lines.join("\n")}`;
  return section.length > MAX_BLOCK_CHARS ? null : section;
}
