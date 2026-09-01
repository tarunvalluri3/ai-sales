import { z } from "zod";

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

/** Blank input becomes `null` (no price), never `0` — see Phase 5 prompt Decision 8. */
export const catalogPriceSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine(
    (value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value),
    "Enter a valid price, e.g. 19.99.",
  )
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

export const catalogPriceAmountSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .refine(
    (value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value),
    "Enter a valid numeric price, e.g. 499.00.",
  )
  .transform((value) => (value === "" ? null : Number(value)));
