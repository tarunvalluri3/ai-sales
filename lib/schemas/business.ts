import { z } from "zod";

/**
 * Shared Zod fields for the business profile (Phase 13b). `name` is
 * required, matching the constraint it's always had since onboarding
 * (Phase 4). The other four are optional -- blank input becomes `null`,
 * matching lib/schemas/catalog.ts's existing convention -- and are
 * dashboard-display-only: not read anywhere in lib/rag.ts's AI pipeline.
 */

export const businessNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a business name (2-120 characters).")
  .max(120, "Business name must be 120 characters or fewer.");

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "");

export const businessDescriptionSchema = optionalTrimmed
  .pipe(z.string().max(500, "Description must be 500 characters or fewer."))
  .transform((value) => (value === "" ? null : value));

export const businessContactEmailSchema = optionalTrimmed
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address.",
  })
  .transform((value) => (value === "" ? null : value));

export const businessContactPhoneSchema = optionalTrimmed
  .refine((value) => value === "" || /^[+()\-.\s\d]{7,20}$/.test(value), {
    message: "Enter a valid phone number.",
  })
  .transform((value) => (value === "" ? null : value));

export const businessWebsiteSchema = optionalTrimmed
  .refine((value) => value === "" || z.string().url().safeParse(value).success, {
    message: "Enter a valid website URL, e.g. https://example.com.",
  })
  .transform((value) => (value === "" ? null : value));

export const businessProfileSchema = z.object({
  name: businessNameSchema,
  description: businessDescriptionSchema,
  contactEmail: businessContactEmailSchema,
  contactPhone: businessContactPhoneSchema,
  website: businessWebsiteSchema,
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
