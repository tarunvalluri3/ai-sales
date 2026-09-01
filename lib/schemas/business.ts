import { z } from "zod";
import { SUPPORTED_WIDGET_LANGUAGES } from "@/lib/widget-i18n";

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

/**
 * Widget branding (Phase 25a) -- all optional/nullable, matching the
 * business-profile fields' "blank means unset, falls back to a default"
 * convention. `accentColor` must be a 6-digit hex or blank (the widget
 * embed page applies it as a raw CSS custom property -- see
 * app/(widget)/widget.css -- so it must never contain anything but a
 * validated color literal).
 */
const optionalTrimmedNullable = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .transform((value) => (value === "" ? null : value));

export const widgetAccentColorSchema = optionalTrimmedNullable.pipe(
  z
    .string()
    .nullable()
    .refine((value) => value === null || /^#[0-9a-fA-F]{6}$/.test(value), {
      message: "Enter a 6-digit hex color, e.g. #d7f24e.",
    }),
);

export const widgetLogoUrlSchema = optionalTrimmedNullable.pipe(
  z
    .string()
    .nullable()
    .refine((value) => value === null || z.string().url().safeParse(value).success, {
      message: "Enter a valid logo image URL.",
    }),
);

export const widgetWelcomeTextSchema = optionalTrimmedNullable.pipe(
  z.string().max(280, "Welcome text must be 280 characters or fewer.").nullable(),
);

export const widgetCtaTextSchema = optionalTrimmedNullable.pipe(
  z.string().max(60, "CTA text must be 60 characters or fewer.").nullable(),
);

export const widgetPositionSchema = z.enum(["bottom-right", "bottom-left"]);

export const widgetLanguageSchema = z.enum(SUPPORTED_WIDGET_LANGUAGES);

/**
 * AI-suggested prefilled questions (Phase 25e), saved only after the
 * owner reviews/edits the AI's proposal on /dashboard/widget-settings --
 * this schema validates the final, human-approved list, not the AI's raw
 * output. Trimmed, deduped, blanks dropped; capped at 6 to match the
 * businesses_widget_suggested_questions_shape DB check.
 */
export const widgetSuggestedQuestionsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(6, "You can save at most 6 suggested questions.")
  .transform((questions) => [...new Set(questions)]);

export const widgetBrandingSchema = z.object({
  accentColor: widgetAccentColorSchema,
  logoUrl: widgetLogoUrlSchema,
  welcomeText: widgetWelcomeTextSchema,
  welcomeTextClosed: widgetWelcomeTextSchema,
  ctaText: widgetCtaTextSchema,
  position: widgetPositionSchema,
  language: widgetLanguageSchema,
});

export type WidgetBrandingInput = z.infer<typeof widgetBrandingSchema>;
