"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import {
  createBusinessForOrg,
  getBusinessForOrg,
  saveOnboardingStep,
  BusinessAlreadyExistsError,
} from "@/lib/business";
import { computeOnboardingProgress, ONBOARDING_STEPS } from "@/lib/onboarding-steps";
import type { OnboardingStep } from "@/lib/supabase/types";
import {
  businessNameSchema,
  businessTypeSchema,
  businessDescriptionSchema,
  businessContactEmailRequiredSchema,
  businessContactPhoneSchema,
  businessWebsiteSchema,
} from "@/lib/schemas/business";
import { logAndGetUserMessage } from "@/lib/errors";

const createBusinessSchema = z.object({
  name: businessNameSchema,
  businessType: businessTypeSchema,
  description: businessDescriptionSchema,
  contactEmail: businessContactEmailRequiredSchema,
  contactPhone: businessContactPhoneSchema,
  website: businessWebsiteSchema,
  timezone: z.string().trim().min(1),
});

export type CreateBusinessFieldErrors = Partial<
  Record<"name" | "businessType" | "description" | "contactEmail" | "contactPhone" | "website" | "timezone", string>
>;

export type CreateBusinessState = {
  error?: string;
  fieldErrors?: CreateBusinessFieldErrors;
};

export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const context = await requireAuthContext({ role: "org:admin" });

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const timezoneRaw = formData.get("timezone");
  const timezone = typeof timezoneRaw === "string" && timezoneRaw.trim() !== "" ? timezoneRaw.trim() : "UTC";
  try {
    // Throws for anything that isn't a real IANA timezone name.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "Please choose a valid timezone." };
  }

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
    description: formData.get("description"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    website: formData.get("website"),
    timezone,
  });
  if (!parsed.success) {
    // Surface every invalid field at once (not just the first) so a
    // multi-step wizard doesn't send the admin back and forth one field
    // at a time -- matches profile/actions.ts's existing pattern.
    const fieldErrors: CreateBusinessFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof CreateBusinessFieldErrors] = issue.message;
      }
    }
    return { error: "Fix the highlighted fields below.", fieldErrors };
  }

  let createFailed = false;
  let errorMessage = "";

  try {
    await createBusinessForOrg(context.orgId, parsed.data);
  } catch (error) {
    if (!(error instanceof BusinessAlreadyExistsError)) {
      createFailed = true;
      errorMessage = logAndGetUserMessage(error);
    }
  }

  if (createFailed) {
    return { error: errorMessage };
  }

  // Onboarding route guard + resume: the "business" step is done the
  // moment the row exists with these fields, so advance the cached step
  // past it. Best-effort -- a failure here must never block the redirect
  // that already created the business.
  await saveOnboardingStep(context.orgId, "knowledge").catch(() => {});

  redirect("/onboarding?step=knowledge");
}

export type AdvanceOnboardingResult = { ok: true } | { ok: false; error: string };

/**
 * Onboarding route guard + resume. Moves the cached `onboarding_step`
 * forward (or back) to `nextStep`, but only after re-checking server-side
 * that every step up to it is genuinely complete -- a caller can never
 * jump the business past a step it hasn't actually finished. "live" is
 * reachable only through `publishBusinessForOrg` (the Publish button),
 * never through this action.
 */
export async function advanceOnboarding(nextStep: OnboardingStep): Promise<AdvanceOnboardingResult> {
  const context = await requireAuthContext({ role: "org:admin" });
  if (!context.orgId) {
    return { ok: false, error: "Select or create an organization first." };
  }

  if (nextStep === "live") {
    return { ok: false, error: "Publish your AI to go live." };
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    return { ok: false, error: "Set up your business first." };
  }

  const { currentStep } = await computeOnboardingProgress(business);
  const nextIndex = ONBOARDING_STEPS.indexOf(nextStep);
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  if (nextIndex > currentIndex) {
    return { ok: false, error: `Finish the "${currentStep}" step first.` };
  }

  await saveOnboardingStep(context.orgId, nextStep);
  return { ok: true };
}
