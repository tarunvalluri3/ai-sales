import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
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
};

export const BUSINESS_AI_CONTEXT_COLUMNS =
  "id, clerk_org_id, name, description, contact_email, contact_phone, website, widget_language, recommend_products_enabled, appointments_enabled";

type BusinessAiContextRow = {
  id: string;
  clerk_org_id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  widget_language: WidgetLanguage;
  recommend_products_enabled: boolean;
  appointments_enabled: boolean;
};

/**
 * Loads the fields askSalesEmployee() needs for a given, already-trusted
 * `businessId` -- never resolves or validates tenant identity itself,
 * that's the caller's job (resolveBusinessFromWidgetKey() for the
 * widget, resolveBusinessFromWhatsappPhoneNumberId() for WhatsApp).
 * Returns null for a deleted/nonexistent business id rather than
 * throwing, matching getConversationForBusiness()'s not-found contract.
 */
export async function loadBusinessAiContext(businessId: string): Promise<BusinessAiContext | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(BUSINESS_AI_CONTEXT_COLUMNS)
    .eq("id", businessId)
    .maybeSingle<BusinessAiContextRow>();

  if (error || !data) {
    return null;
  }

  return {
    businessId: data.id,
    businessName: data.name,
    clerkOrgId: data.clerk_org_id,
    businessProfile: {
      description: data.description,
      contactEmail: data.contact_email,
      contactPhone: data.contact_phone,
      website: data.website,
    },
    language: data.widget_language,
    recommendProductsEnabled: data.recommend_products_enabled,
    appointmentsEnabled: data.appointments_enabled,
  };
}
