import "server-only";
import type { Business, OnboardingStep } from "@/lib/supabase/types";
import { loadReadinessReport } from "@/lib/onboarding-readiness-data";
import { getEntitlementForBusiness } from "@/lib/subscription";
import { getWhatsappConnectionForBusiness } from "@/lib/whatsapp";
import { getInstagramConnectionForBusiness } from "@/lib/instagram";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";

/**
 * Onboarding route guard + resume. `ONBOARDING_STEPS` is the sequence a
 * business moves through; each step's completion is DERIVED from real
 * data already computed elsewhere (lib/onboarding-readiness.ts's publish
 * checklist, the subscription entitlement, and the channel connections)
 * rather than re-implemented here, so there is exactly one place that
 * decides e.g. "are there enough FAQs". `businesses.onboarding_step` is a
 * write-through cache of this (see the migration + advanceOnboarding
 * below) -- never the source of truth the dashboard guard gates on.
 *
 * `account`/`verify` are always complete once this code runs at all:
 * Clerk's hosted sign-up requires a verified email before a session
 * exists, and this app has no separate account-profile step beyond that.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "account",
  "verify",
  "business",
  "knowledge",
  "products",
  "faqs",
  "persona",
  "channels",
  "plan",
  "review",
  "live",
];

/**
 * Where resuming each step should land. Reversed 2026-10-29 (owner's
 * explicit choice, overriding this file's original "no separate wizard
 * UI" design, see STATE.md): setup now happens inside a single guided
 * `/onboarding` wizard shell that reads `?step=` to resume at the right
 * sub-step, instead of the dashboard pages this map used to point at.
 * The dashboard pages themselves are unchanged and still work on their
 * own (editing a product after onboarding, say) -- only where the
 * onboarding GUARD sends an in-progress business has changed.
 */
export const ROUTE_FOR_STEP: Record<OnboardingStep, string> = {
  account: "/onboarding",
  verify: "/onboarding",
  business: "/onboarding",
  knowledge: "/onboarding?step=knowledge",
  products: "/onboarding?step=products",
  faqs: "/onboarding?step=faqs",
  persona: "/onboarding?step=persona",
  channels: "/onboarding?step=channels",
  plan: "/onboarding?step=plan",
  review: "/onboarding?step=review",
  live: "/dashboard",
};

export type OnboardingProgress = {
  completion: Record<OnboardingStep, boolean>;
  /** First incomplete step in sequence; "live" once every step is complete. */
  currentStep: OnboardingStep;
};

/**
 * Computes real onboarding progress for a business from its current
 * Supabase rows. `business` must come from a validated session
 * (requireBusinessContext / getBusinessForOrg), never from client input.
 */
export async function computeOnboardingProgress(business: Business): Promise<OnboardingProgress> {
  const [report, entitlement, whatsapp, instagram, widgetKeys] = await Promise.all([
    loadReadinessReport(business.id, business),
    getEntitlementForBusiness(business.id),
    getWhatsappConnectionForBusiness(business.id),
    getInstagramConnectionForBusiness(business.id),
    listWidgetKeysForBusiness(business.id),
  ]);

  const metKeys = new Set(report.items.filter((item) => item.status !== "unmet").map((item) => item.key));
  const hasActiveWidgetKey = widgetKeys.some((key) => key.status !== "revoked");
  const hasChannel = hasActiveWidgetKey || whatsapp != null || instagram != null;

  const completion: Record<OnboardingStep, boolean> = {
    account: true,
    verify: true,
    business:
      metKeys.has("profile_name") &&
      metKeys.has("profile_business_type") &&
      metKeys.has("profile_description") &&
      metKeys.has("profile_contact_email"),
    knowledge: metKeys.has("knowledge_ready"),
    products: metKeys.has("catalog_present"),
    faqs: metKeys.has("faqs_ready"),
    persona: Boolean(business.widget_welcome_text?.trim()) && Boolean(business.widget_language),
    channels: hasChannel,
    plan: entitlement.serving,
    review: report.canPublish,
    live: business.published_at != null,
  };

  const currentStep = ONBOARDING_STEPS.find((step) => !completion[step]) ?? "live";

  return { completion, currentStep };
}
