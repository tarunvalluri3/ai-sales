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

/**
 * The same field, but mandatory. Used by onboarding and the business profile
 * form, because every business-facing email this product sends -- appointment
 * alerts, handover alerts, the daily digest, workflow emails -- goes to this
 * one address, and a business without it silently receives nothing.
 *
 * The optional variant above is kept, not repurposed: other callers import it
 * by name, and the database column stays nullable on purpose (making it NOT
 * NULL would mean inventing an address for every existing row, which is both a
 * fabricated business fact and a live misdelivery risk).
 */
export const businessContactEmailRequiredSchema = optionalTrimmed
  .refine((value) => value !== "", {
    message: "Enter the email address that should receive lead, handover and appointment alerts.",
  })
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

/**
 * Business type/industry (2026-09-11) -- descriptive/display-only, same
 * category as description/contact/website: not read by lib/rag.ts or any AI
 * behavior. Closed enum matching the businesses_business_type_check DB
 * constraint (20260911000000) -- keep both in sync if this list changes.
 */
export const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-commerce / Online store" },
  { value: "professional_services", label: "Professional services (consulting, agency, legal, accounting)" },
  { value: "healthcare", label: "Healthcare / Clinic" },
  { value: "education", label: "Education / Training" },
  { value: "real_estate", label: "Real estate" },
  { value: "hospitality", label: "Hospitality / Food & beverage" },
  { value: "finance", label: "Finance / Insurance" },
  { value: "technology", label: "Technology / SaaS" },
  { value: "retail", label: "Retail (physical store)" },
  { value: "other", label: "Other" },
] as const;

export const businessTypeSchema = z.enum(
  BUSINESS_TYPES.map((t) => t.value) as [string, ...string[]],
);

export const businessProfileSchema = z.object({
  name: businessNameSchema,
  businessType: businessTypeSchema,
  description: businessDescriptionSchema,
  // Required here as well as at onboarding, so an existing business that
  // predates the rule is asked for one the next time it saves its profile --
  // which is exactly where the dashboard's gate sends it.
  contactEmail: businessContactEmailRequiredSchema,
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
      message: "Enter a full image URL starting with https://, e.g. https://example.com/logo.png.",
    }),
);

/**
 * The business's OWN privacy policy, linked from the widget's consent
 * checkbox (app/(widget)/widget/embed/_components/composer.tsx). Lives in
 * the widget-branding schema because that is the form it is edited in, but
 * it is a business-level legal fact rather than widget chrome -- see the
 * 20261019000000 migration's header.
 *
 * https:// is required rather than any URL (unlike widgetLogoUrlSchema
 * above): this value is rendered straight into an href inside a consent
 * notice served over https, so a plaintext link would be both a
 * mixed-content warning and a trust problem. The same rule is enforced
 * again by the businesses_privacy_policy_url_format DB constraint.
 */
export const businessPrivacyPolicyUrlSchema = optionalTrimmedNullable.pipe(
  z
    .string()
    .nullable()
    .refine(
      (value) =>
        value === null ||
        (z.string().url().safeParse(value).success && value.toLowerCase().startsWith("https://")),
      {
        message:
          "Enter your privacy policy's full URL starting with https://, e.g. https://example.com/privacy.",
      },
    ),
);

export const widgetWelcomeTextSchema = optionalTrimmedNullable.pipe(
  z.string().max(280, "Welcome text must be 280 characters or fewer.").nullable(),
);

export const widgetCtaTextSchema = optionalTrimmedNullable.pipe(
  z.string().max(60, "Chat bubble text must be 60 characters or fewer.").nullable(),
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
  privacyPolicyUrl: businessPrivacyPolicyUrlSchema,
});

export type WidgetBrandingInput = z.infer<typeof widgetBrandingSchema>;
