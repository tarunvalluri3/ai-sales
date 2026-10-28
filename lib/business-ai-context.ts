import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { loadLiveAgentSourceByVersion, type LiveAgentSource } from "@/lib/agent-runtime";
import type { WidgetLanguage } from "@/lib/supabase/types";

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
  /** The published version every field above was read from, and the source lib/rag.ts must read knowledge/catalog/FAQs from (Draft -> Publish -> Live, 2026-10-29). */
  liveSource: LiveAgentSource;
};

type BusinessIdentityRow = {
  id: string;
  clerk_org_id: string;
  live_version_id: string | null;
};

/**
 * Loads the fields askSalesEmployee() needs for a given, already-trusted
 * `businessId` -- never resolves or validates tenant identity itself,
 * that's the caller's job (resolveBusinessFromWidgetKey() for the
 * widget, resolveBusinessFromWhatsappPhoneNumberId() for WhatsApp).
 *
 * Content comes from the business's LIVE snapshot only. Returns null for a
 * deleted/nonexistent business id AND for one that has never been published
 * (no live version) rather than throwing, matching
 * getConversationForBusiness()'s not-found contract -- the callers already
 * log and skip the reply in that case, so an unpublished draft is never
 * served to a prospect.
 */
export async function loadBusinessAiContext(businessId: string): Promise<BusinessAiContext | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, clerk_org_id, live_version_id")
    .eq("id", businessId)
    .maybeSingle<BusinessIdentityRow>();

  if (error || !data || !data.live_version_id) {
    return null;
  }

  const liveSource = await loadLiveAgentSourceByVersion(data.id, data.live_version_id);
  if (!liveSource) {
    return null;
  }
  const config = liveSource.snapshot.config;

  return {
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
    liveSource,
  };
}
