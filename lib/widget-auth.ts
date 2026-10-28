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
  recommendProductsEnabled: boolean;
  appointmentsEnabled: boolean;
  /** The owner's current suggested-question chips -- the only questions an instant (stored) answer may be served for. */
  suggestedQuestions: string[];
};

const BUSINESS_COLUMNS =
  "id, clerk_org_id, name, description, contact_email, contact_phone, website, widget_language, widget_accent_color, widget_logo_url, widget_welcome_text, widget_welcome_text_closed, widget_cta_text, widget_position, widget_suggested_questions, recommend_products_enabled, published_at, appointments_enabled, privacy_policy_url, status, deleted_at";

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
  widget_suggested_questions: string[] | null;
  recommend_products_enabled: boolean;
  published_at: string | null;
  appointments_enabled: boolean;
  privacy_policy_url: string | null;
  /** Phase 33 Stop 2 (docs/phases.md): a platform admin's suspend/soft-delete action must actually stop the AI replying, not just mark a column. */
  status: "active" | "suspended";
  deleted_at: string | null;
};

type WidgetKeyRow = {
  business_id: string;
  status: string;
  allowed_origins: string[];
  businesses: WidgetBusinessRow | null;
};

/**
 * Per-instance, short-lived cache of fully-authorized widget contexts, filled
 * ONLY by the widget-open warm-up (/api/chat/warm) and read ONLY by
 * /api/chat (`useWarmCache`). An entry exists solely because the exact
 * (key, origin) pair just passed every check below, so a hit is as good as
 * the lookup it replaces -- except that a key revoked, an origin removed or a
 * business unpublished inside the TTL still resolves from a warm instance
 * until the entry expires. 15s is the accepted window; entries are never
 * written by the chat route itself, so ordinary traffic gets no such window.
 * In-memory and per serverless instance: a miss (cold instance, another
 * instance, expiry) just does the normal lookup.
 */
const WARM_CONTEXT_TTL_MS = 15_000;
const WARM_CONTEXT_MAX_ENTRIES = 200;
const warmContexts = new Map<string, { expiresAt: number; context: WidgetBusinessContext }>();

function warmContextCacheKey(key: string, origin: string) {
  return `${key}\n${origin}`;
}

function readWarmContext(key: string, origin: string | null): WidgetBusinessContext | null {
  if (!origin) return null;
  const entry = warmContexts.get(warmContextCacheKey(key, origin));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    warmContexts.delete(warmContextCacheKey(key, origin));
    return null;
  }
  return entry.context;
}

/**
 * Runs the full widget-key + origin check (no `last_used_at` write -- the
 * warm-up must not write) and caches the result for the chat route. Throws
 * WidgetAuthError exactly like resolveBusinessFromWidgetKey().
 */
export async function warmWidgetBusinessContext(key: string, origin: string | null): Promise<void> {
  const context = await resolveBusinessFromWidgetKey(key, origin, { touchLastUsed: false });
  if (!origin) return;
  const now = Date.now();
  if (warmContexts.size >= WARM_CONTEXT_MAX_ENTRIES) {
    for (const [cacheKey, entry] of warmContexts) {
      if (entry.expiresAt <= now) warmContexts.delete(cacheKey);
    }
    // Still full of live entries: drop the oldest rather than grow unbounded.
    if (warmContexts.size >= WARM_CONTEXT_MAX_ENTRIES) {
      const oldest = warmContexts.keys().next().value;
      if (oldest !== undefined) warmContexts.delete(oldest);
    }
  }
  warmContexts.set(warmContextCacheKey(key, origin), { expiresAt: now + WARM_CONTEXT_TTL_MS, context });
}

export async function resolveBusinessFromWidgetKey(
  key: string,
  origin: string | null,
  options: { touchLastUsed?: boolean; useWarmCache?: boolean } = {},
): Promise<WidgetBusinessContext> {
  if (options.useWarmCache) {
    const warm = readWarmContext(key, origin);
    if (warm) return warm;
  }
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
  if (
    data.status !== "active" ||
    !origin ||
    !data.allowed_origins.includes(origin) ||
    !data.businesses.published_at ||
    data.businesses.status === "suspended" ||
    data.businesses.deleted_at
  ) {
    throw new WidgetAuthError();
  }

  // Best-effort "last used" bump for the dashboard's key-rotation UI --
  // deliberately fire-and-forget with errors swallowed. This write must
  // never fail closed: a business owner deciding whether an old key is
  // safe to revoke should see a stale timestamp on rare write failure,
  // not a broken chat response.
  if (options.touchLastUsed !== false) {
    void supabase
      .from("widget_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key", key)
      .then(({ error: updateError }) => {
        if (updateError) {
          console.error("widget_keys.last_used_at update failed", updateError);
        }
      });
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
    recommendProductsEnabled: data.businesses.recommend_products_enabled,
    appointmentsEnabled: data.businesses.appointments_enabled,
    suggestedQuestions: data.businesses.widget_suggested_questions ?? [],
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
  suggestedQuestions: string[];
  /** The business's own privacy policy, linked from the widget's consent checkbox. Null means the widget falls back to this app's own /privacy -- see the 20261019000000 migration. */
  privacyPolicyUrl: string | null;
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
    suggestedQuestions: data.businesses.widget_suggested_questions ?? [],
    privacyPolicyUrl: data.businesses.privacy_policy_url,
  };
}
