import { cleanInline, normalizeQuestionKey } from "@/lib/answer-bank/normalize";

/**
 * Catalog questions: "what do you sell", "your services", "price list". The
 * match is a set of anchored, whole-message patterns -- a message with any
 * qualifier ("what services do you offer for hospitals") does not match and
 * goes to the AI. Pure.
 */

const LEAD_IN =
  /^(hi|hello|hey|please|pls|can you|could you|can u|kindly|tell me|show me|i want to know|i would like to know|i'd like to know|want to know)[,\s]+/;

const OBJECT = "(products?|services?|offerings?|items?|catalogue?|price ?list|rate ?card|prices?|pricing|rates)";

const CATALOG_PATTERNS: RegExp[] = [
  /^what (do|all do|all can) you (sell|offer|provide|have)$/,
  new RegExp(`^(what|which) ${OBJECT} (do you|are you) (have|offer|offering|sell|selling|provide|providing)$`),
  new RegExp(`^what (are|is) (all )?(your|the|ur) ${OBJECT}$`),
  new RegExp(`^what ${OBJECT} do you have$`),
  new RegExp(`^(show|tell|give|send)( me)?( all)?( of)?( your| the| ur)? ${OBJECT}$`),
  new RegExp(`^(list|list out|show)( me)?( all)?( of)?( your| the| ur)? ${OBJECT}$`),
  new RegExp(`^(do you have )?(a |an )?(your )?${OBJECT}$`),
  new RegExp(`^(your |ur )?${OBJECT}( and| &) ${OBJECT}$`),
  /^how much do you charge$/,
];

/** True when the whole message asks for the business's full list of offerings or prices. */
export function isCatalogQuestion(message: string): boolean {
  let key = normalizeQuestionKey(message).replace(/[,;:]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const stripped = key.replace(LEAD_IN, "").trim();
    if (stripped === key) break;
    key = stripped;
  }
  return key.length > 0 && CATALOG_PATTERNS.some((pattern) => pattern.test(key));
}

export const CATALOG_ENTRY_KEY = "catalog";
export const CATALOG_ENTRY_TEXT = "What do you offer?";

export type CatalogItem = {
  type: "product" | "service";
  name: string;
  description: string | null;
  price: string | null;
};

const MAX_CATALOG_ITEMS = 12;
const MAX_ITEM_DESCRIPTION_CHARS = 120;

/**
 * The stored catalog answer, built deterministically from the business's own
 * rows -- no model, so no price can be invented or restated wrongly. Returns
 * null for an empty catalog or an unsupported language (the AI handles
 * those). Lists at most MAX_CATALOG_ITEMS and says so when there are more.
 */
export function buildCatalogAnswer(language: string, businessName: string, items: CatalogItem[]): string | null {
  if (language !== "en" || items.length === 0) return null;
  const name = cleanInline(businessName, 80);
  const shown = items.slice(0, MAX_CATALOG_ITEMS);

  const render = (item: CatalogItem) => {
    const price = item.price ? ` — price: ${cleanInline(item.price, 40)}` : "";
    const description = item.description ? ` — ${cleanInline(item.description, MAX_ITEM_DESCRIPTION_CHARS)}` : "";
    return `- ${cleanInline(item.name, 120)}${price}${description}`;
  };

  const products = shown.filter((item) => item.type === "product");
  const services = shown.filter((item) => item.type === "service");
  const lines = [`Here is what ${name} offers:`];
  if (products.length > 0) lines.push("", "Products:", ...products.map(render));
  if (services.length > 0) lines.push("", "Services:", ...services.map(render));
  if (items.length > shown.length) lines.push("", `…and ${items.length - shown.length} more.`);
  lines.push("", "Tell me what you are looking for and I can share the details.");
  return lines.join("\n");
}
