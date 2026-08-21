import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { WidgetLanguage, WidgetPosition } from "@/lib/supabase/types";

/**
 * Thrown for any widget-key/origin resolution failure. Deliberately
 * generic -- the caller (app/api/chat/route.ts) must not surface which
 * specific check failed (unknown key vs. origin mismatch vs. unconfigured
 * origin), per docs/security.md §10.
 */
export class WidgetAuthError extends Error {
  constructor() {
    super("Invalid widget key or origin.");
    this.name = "WidgetAuthError";
  }
}

/**
 * Resolves a public widget key (docs/security.md §4, resolved decision D4
 * in STATE.md; widget_keys table introduced Phase 24 for rotation and
 * multiple origins per key) to a validated business_id, server-side only.
 * Never accepts a client-supplied business_id anywhere in this flow.
 * Fails closed: an unknown key, a revoked key, a key with no configured
 * origins yet, a missing origin header, or an origin not in the key's
 * allowed_origins list all throw the same WidgetAuthError.
 */
export type WidgetBusinessContext = {
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
};

const BUSINESS_COLUMNS =
  "id, clerk_org_id, name, description, contact_email, contact_phone, website, widget_language, widget_accent_color, widget_logo_url, widget_welcome_text, widget_welcome_text_closed, widget_cta_text, widget_position, published_at";

type WidgetBusinessRow = {
  id: string;
  clerk_org_id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  widget_language: WidgetLanguage;
  widget_accent_color: string | null;
  widget_logo_url: string | null;
  widget_welcome_text: string | null;
  widget_welcome_text_closed: string | null;
  widget_cta_text: string | null;
  widget_position: WidgetPosition;
  published_at: string | null;
};

type WidgetKeyRow = {
  business_id: string;
  status: string;
  allowed_origins: string[];
  businesses: WidgetBusinessRow | null;
};

export async function resolveBusinessFromWidgetKey(
  key: string,
  origin: string | null,
): Promise<WidgetBusinessContext> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .select(`business_id, status, allowed_origins, businesses(${BUSINESS_COLUMNS})`)
    .eq("key", key)
    .maybeSingle<WidgetKeyRow>();

  if (error || !data || !data.businesses) {
    throw new WidgetAuthError();
  }

  // Phase 25c: an unpublished business (published_at null -- the new
  // "test your AI before publishing" gate) fails closed exactly like an
  // unknown key or a bad origin. Collapsing it into the same generic
  // WidgetAuthError is deliberate, not an oversight -- docs/security.md
  // §10 already establishes that this endpoint must never reveal which
  // specific check failed.
  if (data.status !== "active" || !origin || !data.allowed_origins.includes(origin) || !data.businesses.published_at) {
    throw new WidgetAuthError();
  }

  return {
    businessId: data.business_id,
    businessName: data.businesses.name,
    clerkOrgId: data.businesses.clerk_org_id,
    businessProfile: {
      description: data.businesses.description,
      contactEmail: data.businesses.contact_email,
      contactPhone: data.businesses.contact_phone,
      website: data.businesses.website,
    },
    language: data.businesses.widget_language,
  };
}

export type WidgetBranding = {
  businessId: string;
  businessName: string;
  language: WidgetLanguage;
  accentColor: string | null;
  logoUrl: string | null;
  welcomeText: string | null;
  welcomeTextClosed: string | null;
  ctaText: string | null;
  position: WidgetPosition;
};

/**
 * Cosmetic-only lookup for app/(widget)/widget/embed/page.tsx -- unlike
 * resolveBusinessFromWidgetKey(), this does NOT check the request's
 * origin against the key's allowed_origins list. A top-level iframe
 * navigation does not reliably carry the same Origin header a same-page
 * fetch() does, and none of the fields returned here are more sensitive
 * than the widget key itself already is (a publishable identifier, same
 * trust class as a Stripe publishable key -- docs/security.md §4). The
 * real security boundary (which origins may actually send/read messages)
 * stays entirely on resolveBusinessFromWidgetKey(), used by
 * /api/chat and /api/chat/restore. Still fails closed on an unknown or
 * revoked key.
 */
export async function resolveBusinessBrandingFromWidgetKey(key: string): Promise<WidgetBranding | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .select(`business_id, status, businesses(${BUSINESS_COLUMNS})`)
    .eq("key", key)
    .maybeSingle<{ business_id: string; status: string; businesses: WidgetBusinessRow | null }>();

  if (error || !data || !data.businesses || data.status !== "active") {
    return null;
  }

  return {
    businessId: data.business_id,
    businessName: data.businesses.name,
    language: data.businesses.widget_language,
    accentColor: data.businesses.widget_accent_color,
    logoUrl: data.businesses.widget_logo_url,
    welcomeText: data.businesses.widget_welcome_text,
    welcomeTextClosed: data.businesses.widget_welcome_text_closed,
    ctaText: data.businesses.widget_cta_text,
    position: data.businesses.widget_position,
  };
}
