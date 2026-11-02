import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { loadLiveAgentSourceByVersion, type LiveAgentSource } from "@/lib/agent-runtime";
import type { WidgetLanguage } from "@/lib/supabase/types";
import { evaluateChannelAccess, type ChannelAccessRejection } from "@/lib/business-lifecycle";

/**
 * The shared shape both the widget's and WhatsApp's front doors need to
 * call askSalesEmployee() -- extracted from lib/widget-auth.ts's
 * resolveBusinessFromWidgetKey() (Phase 16) so the two callers don't each
 * hand-maintain their own copy of BUSINESS_COLUMNS/row-mapping. Widget
 * auth is a CORS/origin check on top of this; WhatsApp resolves
 * `businessId` from a phone_number_id lookup instead (lib/whatsapp.ts)
 * and then calls this directly with no origin concept at all.
 */
export type BusinessAiContext = {
  businessId: string;
  businessName: string;
  clerkOrgId: string;
  businessProfile: {
    description: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
  };
  language: WidgetLanguage;
  recommendProductsEnabled: boolean;
  appointmentsEnabled: boolean;
  /** The live persona's suggested questions -- the instant-answer (answer bank) input the widget also uses. */
  suggestedQuestions: string[];
  /** The published version every field above was read from, and the source lib/rag.ts must read knowledge/catalog/FAQs from (Draft -> Publish -> Live, 2026-10-29). */
  liveSource: LiveAgentSource;
};

type BusinessIdentityRow = {
  id: string;
  clerk_org_id: string;
  live_version_id: string | null;
  status: "active" | "suspended";
  deleted_at: string | null;
};

/**
 * Why no AI reply may be sent. `business_suspended`/`business_deleted`/
 * `agent_not_published` are expected states (log at info, store the inbound
 * message, send nothing); `lookup_failed`/`business_not_found`/
 * `live_version_unavailable` are faults (log as errors).
 */
export type BusinessAiContextRefusal = ChannelAccessRejection | "lookup_failed" | "live_version_unavailable";

export type BusinessAiContextResult =
  | { ok: true; context: BusinessAiContext }
  | { ok: false; reason: BusinessAiContextRefusal };

/** True for the refusals that are a business's chosen/imposed state, not a fault. */
export function isExpectedRefusal(reason: BusinessAiContextRefusal): boolean {
  return reason === "business_suspended" || reason === "business_deleted" || reason === "agent_not_published";
}

/**
 * Loads the fields askSalesEmployee() needs for a given, already-trusted
 * `businessId` -- never resolves or validates tenant identity itself,
 * that's the caller's job (resolveBusinessFromWidgetKey() for the
 * widget, resolveBusinessFromWhatsappPhoneNumberId() for WhatsApp).
 *
 * THE gate for every non-widget channel: it refuses a suspended or
 * soft-deleted business (lib/business-lifecycle.ts, the same rule the widget
 * applies) and one that has never been published, in the same single row
 * read. Content comes from the business's LIVE snapshot only, so an
 * unpublished draft is never served to a prospect. Never throws.
 */
export async function loadBusinessAiContext(businessId: string): Promise<BusinessAiContextResult> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, clerk_org_id, live_version_id, status, deleted_at")
    .eq("id", businessId)
    .maybeSingle<BusinessIdentityRow>();

  if (error) {
    return { ok: false, reason: "lookup_failed" };
  }
  const refusal = evaluateChannelAccess(data);
  if (refusal || !data?.live_version_id) {
    return { ok: false, reason: refusal ?? "agent_not_published" };
  }

  const liveSource = await loadLiveAgentSourceByVersion(data.id, data.live_version_id);
  if (!liveSource) {
    return { ok: false, reason: "live_version_unavailable" };
  }
  const config = liveSource.snapshot.config;

  return { ok: true, context: {
    businessId: data.id,
    businessName: config.name,
    clerkOrgId: data.clerk_org_id,
    businessProfile: {
      description: config.description,
      contactEmail: config.contactEmail,
      contactPhone: config.contactPhone,
      website: config.website,
    },
    language: config.language,
    recommendProductsEnabled: config.capabilities.recommendProducts,
    appointmentsEnabled: config.capabilities.appointments,
    suggestedQuestions: config.persona.suggestedQuestions,
    liveSource,
  } };
}
