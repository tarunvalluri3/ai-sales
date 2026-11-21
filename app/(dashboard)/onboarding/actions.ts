"use server";

import { parseWeeklyHours } from "@/lib/schemas/weekly-hours";
import { ensureWidgetKey, updateWidgetKeyOrigins } from "@/lib/widget-keys";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { onboardingWebsiteSchema, websiteOrigin } from "@/lib/schemas/onboarding-website";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { syncClerkOrganizationName } from "@/lib/clerk-org-name";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import {
  createBusinessForOrg,
  getBusinessForOrg,
  saveOnboardingStep,
  updateBusinessOptionalDetails,
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
  businessPrivacyPolicyUrlSchema,
  businessCurrencySchema,
} from "@/lib/schemas/business";
import { normalizeTimezone, TIMEZONE_ERROR_MESSAGES } from "@/lib/timezones";
import { currencyForTimezone } from "@/lib/currency";
import { logAndGetUserMessage } from "@/lib/errors";
import { withRequestTiming, type RequestTiming } from "@/lib/request-timing";

const createBusinessSchema = z.object({
  name: businessNameSchema,
  businessType: businessTypeSchema,
  description: businessDescriptionSchema,
  contactEmail: businessContactEmailRequiredSchema,
  contactPhone: businessContactPhoneSchema,
  website: businessWebsiteSchema,
  timezone: z.string().trim().min(1),
  currency: businessCurrencySchema,
});

export type CreateBusinessFieldErrors = Partial<
  Record<"name" | "businessType" | "description" | "contactEmail" | "contactPhone" | "website" | "timezone" | "currency", string>
>;

export type CreateBusinessState = {
  error?: string;
  fieldErrors?: CreateBusinessFieldErrors;
};

export async function createBusiness(
  prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  return withRequestTiming(
    "onboarding_create_business",
    (timing) => createBusinessTimed(timing, prevState, formData),
    (state) => (state.error ? "rejected" : "ok"),
  );
}

async function createBusinessTimed(
  timing: RequestTiming,
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const context = await timing.time("auth", () => requireAuthContext({ role: "org:admin" }));

  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  // Never a silent UTC fallback (bug, 2026-11-20: an IST sign-up got UTC
  // hours). A missing or unknown zone is an error on the field; a legacy
  // browser name ("Asia/Calcutta") is mapped to the current one.
  const zone = normalizeTimezone(formData.get("timezone"));
  // The currency defaults from the zone only when the form didn't send one.
  const currencyRaw = formData.get("currency");
  const currency =
    typeof currencyRaw === "string" && currencyRaw.trim() !== ""
      ? currencyRaw.trim()
      : zone.ok
        ? currencyForTimezone(zone.timezone)
        : "";

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    businessType: formData.get("businessType"),
    description: formData.get("description"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone") ?? undefined,
    website: formData.get("website") ?? undefined,
    timezone: zone.ok ? zone.timezone : "",
    currency,
  });
  if (!parsed.success || !zone.ok) {
    // Surface every invalid field at once (not just the first) so a
    // multi-step wizard doesn't send the admin back and forth one field
    // at a time -- matches profile/actions.ts's existing pattern.
    const fieldErrors: CreateBusinessFieldErrors = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof CreateBusinessFieldErrors] = issue.message;
      }
    }
    if (!zone.ok) fieldErrors.timezone = TIMEZONE_ERROR_MESSAGES[zone.reason];
    return { error: "Fix the highlighted fields below.", fieldErrors };
  }

  const week = formData.get("confirmHours") === "true" ? parseWeeklyHours(formData) : undefined;
  if (week && "error" in week) return { error: week.error };

  let createFailed = false;
  let errorMessage = "";

  try {
    const orgId = context.orgId;
    await timing.time("create_business", () => createBusinessForOrg(orgId, { ...parsed.data, hours: week?.days }));
  } catch (error) {
    if (!(error instanceof BusinessAlreadyExistsError)) {
      createFailed = true;
      errorMessage = logAndGetUserMessage(error);
    }
  }

  if (createFailed) {
    return { error: errorMessage };
  }

  // Keep the Clerk organization (top-right switcher) named after the business.
  // The org id is the session's own; best-effort, after the response.
  const sessionOrgId = context.orgId;
  after(() => syncClerkOrganizationName(sessionOrgId, parsed.data.name));

  // Onboarding route guard + resume: the "business" step is done the
  // moment the row exists with these fields, so advance the cached step
  // past it. Best-effort -- a failure here must never block the redirect
  // that already created the business.
  const orgId = context.orgId;
  await timing.time("save_step", () =>
    saveOnboardingStep(orgId, "knowledge", ONBOARDING_STEPS.slice(0, ONBOARDING_STEPS.indexOf("knowledge"))).catch(() => {}),
  );

  redirect("/onboarding?step=knowledge");
}

const optionalDetailsSchema = z.object({
  website: businessWebsiteSchema,
  privacyPolicyUrl: businessPrivacyPolicyUrlSchema,
});

export type OptionalDetailsState = {
  error?: string;
  fieldErrors?: Partial<Record<"website" | "privacyPolicyUrl", string>>;
  success?: boolean;
};

/** Review step: saves the recommended website / privacy policy URL. Blank clears a value. */
export async function saveOptionalDetailsAction(
  _prevState: OptionalDetailsState,
  formData: FormData,
): Promise<OptionalDetailsState> {
  const context = await requireAuthContext({ role: "org:admin" });
  if (!context.orgId) {
    return { error: "Select or create an organization first." };
  }

  const parsed = optionalDetailsSchema.safeParse({
    website: formData.get("website"),
    privacyPolicyUrl: formData.get("privacyPolicyUrl"),
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<OptionalDetailsState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof typeof fieldErrors] = issue.message;
      }
    }
    return { error: "Fix the highlighted fields below.", fieldErrors };
  }

  try {
    await updateBusinessOptionalDetails(context.orgId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/onboarding");
  return { success: true };
}

export type AdvanceOnboardingResult = { ok: true } | { ok: false; error: string };

/**
 * Onboarding route guard + resume. Moves the cached `onboarding_step`
 * forward to `nextStep`, but only after re-checking server-side
 * that every step up to it is genuinely complete -- a caller can never
 * jump the business past a step it hasn't actually finished. "live" is
 * reachable only through `publishBusinessForOrg` (the Publish button),
 * never through this action.
 */
export async function advanceOnboarding(nextStep: OnboardingStep): Promise<AdvanceOnboardingResult> {
  return withRequestTiming(
    "onboarding_advance",
    (timing) => advanceOnboardingTimed(timing, nextStep),
    (result) => (result.ok ? "ok" : "rejected"),
  );
}

async function advanceOnboardingTimed(timing: RequestTiming, nextStep: OnboardingStep): Promise<AdvanceOnboardingResult> {
  const timed = <T,>(stage: string, call: () => Promise<T>): Promise<T> => timing.time(stage, call);

  const context = await timed("authorize", () => requireAuthContext({ role: "org:admin" }));
  if (!context.orgId) {
    return { ok: false, error: "Select or create an organization first." };
  }

  if (nextStep === "live") {
    return { ok: false, error: "Publish your AI to go live." };
  }

  const orgId = context.orgId;
  const business = await timed("load_business", () => getBusinessForOrg(orgId));
  if (!business) {
    return { ok: false, error: "Set up your business first." };
  }

  const { currentStep } = await timed("check_progress", () => computeOnboardingProgress(business));
  const nextIndex = ONBOARDING_STEPS.indexOf(nextStep);
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  if (nextIndex > currentIndex) {
    return { ok: false, error: `Finish the "${currentStep}" step first.` };
  }

  if (nextIndex < 0) return { ok: false, error: "Invalid onboarding step." };
  if (nextIndex > ONBOARDING_STEPS.indexOf(business.onboarding_step)) {
    await timed("save_step", () => saveOnboardingStep(orgId, nextStep, ONBOARDING_STEPS.slice(0, nextIndex)));
    revalidatePath("/onboarding");
  }
  return { ok: true };
}

export type OnboardingWebsiteState = { error?: string; saved?: boolean };

export async function saveOnboardingWebsiteAction(
  _state: OnboardingWebsiteState,
  form: FormData,
): Promise<OnboardingWebsiteState> {
  const { businessId, userId, orgId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = form.get("websiteIntent") === "skip" ? null : onboardingWebsiteSchema.safeParse(form.get("website"));
  if (parsed && !parsed.success) return { error: parsed.error.issues[0].message };
  const origin = parsed?.data ?? null;

  try {
    const { key, created } = await ensureWidgetKey(businessId, origin);
    if (created) {
      await recordAuditLogEntry(businessId, userId, "widget_key.created", "widget_key", key.id);
    } else if (origin && !key.allowed_origins.includes(origin)) {
      const updated = await updateWidgetKeyOrigins(businessId, key.id, [...key.allowed_origins, origin], key.name);
      if (!updated) return { error: "The widget key changed. Reload and try again." };
      await recordAuditLogEntry(businessId, userId, "widget_key.origins_updated", "widget_key", key.id);
    }
    if (origin) {
      const business = await getBusinessForOrg(orgId);
      if (business && websiteOrigin(business.website) !== origin) {
        await updateBusinessOptionalDetails(orgId, { website: origin });
      }
    }
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/widget-settings");
  revalidatePath("/onboarding");
  return { saved: true };
}
