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
