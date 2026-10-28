import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Business, OnboardingStep } from "@/lib/supabase/types";
import type { BusinessProfileInput, WidgetBrandingInput } from "@/lib/schemas/business";
import { AppError } from "@/lib/errors";
import { loadReadinessReport } from "@/lib/onboarding-readiness-data";
import { describeBlockingItems, type ReadinessItem } from "@/lib/onboarding-readiness";
import { track } from "@/lib/analytics-events";
import { getEntitlementForBusiness } from "@/lib/subscription";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

/**
 * Signals that a business already exists for this org — an idempotent
 * outcome for a duplicate create attempt, not a user-facing failure.
 */
export class BusinessAlreadyExistsError extends Error {
  constructor() {
    super("A business already exists for this organization.");
    this.name = "BusinessAlreadyExistsError";
  }
}

/**
 * Looks up the business row for a given Clerk org. `orgId` must come from
 * a validated session (`requireAuthContext()`), never from client input.
 * The explicit `clerk_org_id` filter is defense in depth alongside RLS.
 *
 * Wrapped in React's `cache()` so repeated calls with the same `orgId`
 * within a single request/render pass (e.g. a layout and its page both
 * calling `requireBusinessContext()`, or several Server Actions firing
 * close together) are deduped to one DB round trip instead of one each
 * -- this doesn't cover Next's `fetch()`-based Data Cache (Supabase
 * calls aren't `fetch()`), so `cache()` is the correct, docs-recommended
 * substitute. Memoization is per-request only; it never returns stale
 * data across separate requests/actions.
 */
export const getBusinessForOrg = cache(async (orgId: string): Promise<Business | null> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Something went wrong loading your business. Please try again.",
      "getBusinessForOrg failed",
      error,
    );
  }

  return data;
});

/** Full field set the onboarding wizard collects (2026-09-11). */
export type CreateBusinessInput = {
  name: string;
  businessType: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  timezone: string;
};

/**
 * Creates the business row for a given Clerk org. `orgId` must come from
 * a validated session, never from client input.
 */
export async function createBusinessForOrg(
  orgId: string,
  input: CreateBusinessInput,
): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      clerk_org_id: orgId,
      name: input.name,
      business_type: input.businessType,
      description: input.description,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      website: input.website,
      timezone: input.timezone,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new BusinessAlreadyExistsError();
    }

    throw new AppError(
      "Something went wrong creating your business. Please try again.",
      "createBusinessForOrg failed",
      error,
    );
  }

  track(supabase, data.id, "business.signed_up", { businessType: input.businessType });

  return data;
}

/**
 * Updates the business profile for a given Clerk org. `orgId` must come
 * from a validated session, never from client input. Authorization
 * (org:admin-only) is enforced by the caller via
 * `requireAuthContext({ role: "org:admin" })`, not by this function --
 * this filter is tenant scoping only, matching every other function in
 * this file.
 */
export async function updateBusinessProfile(
  orgId: string,
  input: BusinessProfileInput,
): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({
      name: input.name,
      business_type: input.businessType,
      description: input.description,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      website: input.website,
    })
    .eq("clerk_org_id", orgId)
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong updating your business profile. Please try again.",
      "updateBusinessProfile failed",
      error,
    );
  }

  return data;
}

/**
 * Updates a business's widget branding/language settings (Phase 25a).
 * `orgId` must come from a validated session; authorization (org:admin-only)
 * is enforced by the caller, same convention as `updateBusinessProfile`.
 */
export async function updateWidgetBranding(orgId: string, input: WidgetBrandingInput): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({
      widget_accent_color: input.accentColor,
      widget_logo_url: input.logoUrl,
      widget_welcome_text: input.welcomeText,
      widget_welcome_text_closed: input.welcomeTextClosed,
      widget_cta_text: input.ctaText,
      widget_position: input.position,
      widget_language: input.language,
      privacy_policy_url: input.privacyPolicyUrl,
    })
    .eq("clerk_org_id", orgId)
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong updating your widget settings. Please try again.",
      "updateWidgetBranding failed",
      error,
    );
  }

  return data;
}

/**
 * Saves the business's reviewed/edited list of AI-suggested prefilled
 * widget questions (Phase 25e). `questions` must already be the final,
 * human-approved list -- validated shape only, no AI call happens here
 * (see `lib/widget-suggested-questions.ts` for generation). An empty
 * array clears the setting (falls back to no chips shown, not an error).
 * `orgId` must come from a validated session; authorization
 * (org:admin-only) is enforced by the caller, same convention as
 * `updateWidgetBranding`.
 */
export async function updateWidgetSuggestedQuestions(orgId: string, questions: string[]): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ widget_suggested_questions: questions.length > 0 ? questions : null })
    .eq("clerk_org_id", orgId)
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong saving your suggested questions. Please try again.",
      "updateWidgetSuggestedQuestions failed",
      error,
    );
  }

  return data;
}

/**
 * Sets a business's AI capabilities: whether recommend_products and
 * appointment booking are on (both explicit dashboard settings, never
 * auto-inferred, gating what `lib/rag.ts` binds and how it chains them --
 * see formatCapabilityChainingInstruction) and the appointment slot
 * length. One atomic update so the three fields never end up
 * inconsistent. `orgId` must come from a validated session; authorization
 * (org:admin-only) is enforced by the caller, same convention as
 * `updateWidgetBranding`. Lead capture (request_callback) has no setting
 * here -- it's unconditionally bound in `askSalesEmployee()`.
 */
export async function updateAiCapabilities(
  orgId: string,
  input: { recommendProductsEnabled: boolean; appointmentsEnabled: boolean; appointmentSlotMinutes: number },
): Promise<Business> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({
      recommend_products_enabled: input.recommendProductsEnabled,
      appointments_enabled: input.appointmentsEnabled,
      appointment_slot_minutes: input.appointmentSlotMinutes,
    })
    .eq("clerk_org_id", orgId)
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong updating your AI's capabilities. Please try again.",
      "updateAiCapabilities failed",
      error,
    );
  }

  return data;
}

/**
 * Signals that a publish was refused because the draft does not give the AI
 * enough real, retrievable knowledge to face prospects
 * (feat/onboarding-readiness) -- on the first publish AND, since Draft ->
 * Publish -> Live, on every later one. Carries the blocking items so the
 * caller can tell the owner exactly what is still missing; empty when the
 * refusal is only "knowledge is still processing".
 */
export class BusinessNotReadyError extends Error {
  readonly blockingItems: ReadinessItem[];
  constructor(message: string, blockingItems: ReadinessItem[]) {
    super(message);
    this.name = "BusinessNotReadyError";
    this.blockingItems = blockingItems;
  }
}

/** What a publish did: the live version now serving, and whether it differs from the previous one. */
export type PublishAgentResult = {
  business: Business;
  version: number;
  /** False when the draft already equalled the live version -- publishing again is a no-op. */
  changed: boolean;
};

/** Postgres error text the publish function raises while knowledge is still being embedded. */
const PUBLISH_PROCESSING_PREFIX = "AGENT_PUBLISH_PROCESSING:";

/**
 * The one publish path (Draft -> Publish -> Live, 2026-10-29): freezes the
 * current draft -- business profile/persona/branding, approved products,
 * services and FAQs, published knowledge -- into a new immutable
 * `agent_versions` snapshot and makes it the version the widget, WhatsApp and
 * Instagram serve. Used by the onboarding "Publish agent" button AND the
 * dashboard's "Publish changes"; there is no second route.
 *
 * `orgId` must come from a validated session; authorization (org:admin-only)
 * is enforced by the caller, same convention as `updateBusinessProfile`.
 *
 * Validation runs EVERY time, not just on the first publish: an edit that
 * pushes the draft below the readiness bar (e.g. FAQs under the minimum)
 * throws `BusinessNotReadyError` carrying the same missing-items list and
 * writes nothing -- the live version keeps serving exactly as it was. (This
 * replaces the previous "a republish is never gated" rule, which only existed
 * because a republish used to change nothing the AI could say.)
 *
 * Atomic and idempotent: the snapshot, the version row, the live chunk copy,
 * the live-pointer flip and the response-cache purge all happen inside the
 * `publish_agent` database function in one transaction under a row lock.
 * Publishing a draft identical to the live version returns that version with
 * `changed: false` and touches nothing.
 */
export async function publishBusinessForOrg(orgId: string): Promise<PublishAgentResult> {
  const business = await getBusinessForOrg(orgId);
  if (!business) {
    throw new AppError(
      "Something went wrong publishing your AI. Please try again.",
      "publishBusinessForOrg: no business for org",
    );
  }

  // The subscription is the server-side source of truth for whether an agent
  // may be live (lib/agent-serving.ts). A lapsed one cannot publish: going
  // live would serve nobody, and "Publish changes" would look like it worked.
  // Read fresh (not the runtime's short-lived cache) -- a customer who has
  // just fixed their payment must be able to publish straight away. Grace
  // period counts as valid, same as the runtime.
  const entitlement = await getEntitlementForBusiness(business.id);
  if (!entitlement.serving) {
    throw new BusinessNotReadyError(
      "Your subscription is not active, so changes can't go live. Choose a plan in Billing, then publish again -- your current agent is unchanged.",
      [],
    );
  }

  // `blockingItems` is evaluated regardless of publish state ("read
  // blockingItems for the audit view" -- lib/onboarding-readiness.ts); the
  // report's `canPublish`/`gateApplies` still describe the old first-publish-
  // only rule, so they are deliberately not used here.
  const isFirstPublish = business.published_at == null;
  const report = await loadReadinessReport(business.id, business);
  if (report.blockingItems.length > 0) {
    throw new BusinessNotReadyError(describeBlockingItems(report.blockingItems), report.blockingItems);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("publish_agent", { p_business_id: business.id });

  if (error) {
    if (error.message?.includes(PUBLISH_PROCESSING_PREFIX)) {
      throw new BusinessNotReadyError(
        "Some of your knowledge is still being processed. Try again in a few seconds -- your live agent is unchanged.",
        [],
      );
    }
    throw new AppError(
      "Something went wrong publishing your AI. Please try again.",
      "publishBusinessForOrg failed",
      error,
    );
  }

  const published = (data as { version: number; changed: boolean }[] | null)?.[0];
  if (!published) {
    throw new AppError(
      "Something went wrong publishing your AI. Please try again.",
      "publishBusinessForOrg: publish_agent returned no row",
    );
  }

  // Re-read (bypassing this request's memoized copy) so the caller sees the
  // post-publish row.
  const { data: refreshed, error: refreshError } = await supabase
    .from("businesses")
    .select("*")
    .eq("clerk_org_id", orgId)
    .single();
  if (refreshError) {
    throw new AppError(
      "Something went wrong publishing your AI. Please try again.",
      "publishBusinessForOrg: refresh failed",
      refreshError,
    );
  }

  if (isFirstPublish) {
    track(supabase, refreshed.id, "business.first_published");
  }

  return { business: refreshed, version: published.version, changed: published.changed };
}

/**
 * Persists the onboarding-step cache (lib/onboarding-steps.ts). `orgId`
 * must come from a validated session. Never sets 'live' -- that only
 * ever happens inside `publishBusinessForOrg`, atomically with
 * `published_at`, so the two can never disagree.
 */
export async function saveOnboardingStep(orgId: string, step: Exclude<OnboardingStep, "live">): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("businesses")
    .update({ onboarding_step: step })
    .eq("clerk_org_id", orgId);

  if (error) {
    throw new AppError(
      "Something went wrong saving your onboarding progress. Please try again.",
      "saveOnboardingStep failed",
      error,
    );
  }
}

/**
 * Permanently deletes the business row for a given Clerk org, cascading
 * to every business-owned table (Phase 22e) -- no residual row anywhere.
 * Does NOT touch the Clerk organization itself, by explicit user choice
 * (STATE.md): the org and its members are untouched, and would simply
 * re-onboard (create a fresh business) if anyone signs back in. `orgId`
 * must come from a validated session; authorization (org:admin-only,
 * plus the caller's own type-to-confirm check) is enforced by the
 * caller, same convention as `updateBusinessProfile`. Returns `false`
 * without throwing if no business existed for this org (nothing to
 * delete, not an error).
 */
export async function deleteBusinessForOrg(orgId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .delete()
    .eq("clerk_org_id", orgId)
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong deleting your business. Please try again.",
      "deleteBusinessForOrg failed",
      error,
    );
  }

  return data.length > 0;
}
