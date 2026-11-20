import { z } from "zod";
import { parsePriceAmount, plainNumericPrice } from "@/lib/currency";

/**
 * Shared Zod fields for products and services (both: name, optional
 * description, optional price). FAQs don't use these — they validate
 * question/answer directly in their own action file.
 */

export const catalogNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(120, "Name must be 120 characters or fewer.");

export const catalogDescriptionSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .transform((value) => (value === "" ? null : value));

/**
 * The owner's DISPLAY price, as text (2026-11-20): "Rs 6,500", "From ₹1,200",
 * "₹500/session", "Contact us" are all valid -- the field used to accept only
 * "19.99"-style numbers and rejected an Indian clinic's "Rs 6,500". Blank
 * becomes `null` (no price), never `0` -- see Phase 5 prompt Decision 8.
 * Control characters are dropped and whitespace flattened; React escapes it
 * on display and the AI path strips tag characters before a prompt.
 */
export const CATALOG_PRICE_MAX_LENGTH = 60;

const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

export const catalogPriceSchema = z
  .string()
  .optional()
  .transform((value) => (value ?? "").replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim())
  .refine((value) => value.length <= CATALOG_PRICE_MAX_LENGTH, `Keep the price under ${CATALOG_PRICE_MAX_LENGTH} characters.`)
  .transform((value) => (value === "" ? null : value));

/**
 * Phase B1 (STATE.md, "AI sales agent, not chatbot"): three optional
 * fields backing budget-aware, image-backed recommendations. `image_url`
 * and `category` are display/filter metadata; `price_amount` is a real
 * number kept alongside `price` (free text) specifically for budget
 * comparisons -- `price` stays the source of truth for what's shown to a
 * prospect (some businesses will always want "Contact for pricing").
 */
export const catalogImageUrlSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine((value) => value === "" || z.string().url().safeParse(value).success, "Enter a valid image URL.")
  .transform((value) => (value === "" ? null : value));

export const catalogCategorySchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine((value) => value.length <= 60, "Category must be 60 characters or fewer.")
  .transform((value) => (value === "" ? null : value));

/** Budget-matching amount: a plain number, Western or Indian grouping allowed ("6500", "6,500", "1,20,000"). Blank becomes null. */
export const catalogPriceAmountSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine((value) => value === "" || plainNumericPrice(value) !== null, "Enter a number only, e.g. 6500, or leave it blank.")
  .refine((value) => value === "" || (plainNumericPrice(value) ?? 0) < 10_000_000_000, "That number is too large.")
  .transform((value) => (value === "" ? null : plainNumericPrice(value)));

// ---------------------------------------------------------- the whole form

export const CATALOG_FORM_FIELDS = ["name", "description", "price", "image_url", "category", "price_amount"] as const;
export type CatalogFormField = (typeof CATALOG_FORM_FIELDS)[number];
/** Exactly what the owner typed, echoed back on a failed submit so the form keeps it. */
export type CatalogFormValues = Record<CatalogFormField, string>;
export type CatalogFieldErrors = Partial<Record<CatalogFormField, string>>;

export const catalogItemFieldsSchema = z
  .object({
    name: catalogNameSchema,
    description: catalogDescriptionSchema,
    price: catalogPriceSchema,
    image_url: catalogImageUrlSchema,
    category: catalogCategorySchema,
    price_amount: catalogPriceAmountSchema,
  })
  // Budget matching from the display price when the owner left the number
  // blank: only an unambiguous single number (lib/currency.ts parsePriceAmount).
  .transform((data) => ({ ...data, price_amount: data.price_amount ?? parsePriceAmount(data.price) }));

export type CatalogItemFields = z.output<typeof catalogItemFieldsSchema>;

export function readCatalogFormValues(formData: FormData): CatalogFormValues {
  const values = {} as CatalogFormValues;
  for (const field of CATALOG_FORM_FIELDS) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw : "";
  }
  return values;
}

export type CatalogFormResult =
  | { ok: true; data: CatalogItemFields }
  | { ok: false; fieldErrors: CatalogFieldErrors; values: CatalogFormValues };

/**
 * Validates a product/service form. On failure returns EVERY field's first
 * error plus the submitted values, so the form can show each error next to
 * its field and keep what was typed (React 19 resets an uncontrolled form
 * after every action, including a failed one -- 2026-11-20 bug: one bad
 * price wiped the whole form).
 */
export function parseCatalogForm(formData: FormData): CatalogFormResult {
  const values = readCatalogFormValues(formData);
  const parsed = catalogItemFieldsSchema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: CatalogFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (CATALOG_FORM_FIELDS as readonly string[]).includes(field) && !(field in fieldErrors)) {
      fieldErrors[field as CatalogFormField] = issue.message;
    }
  }
  return { ok: false, fieldErrors, values };
}
