import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

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
 * in STATE.md) to a validated business_id, server-side only. Never accepts
 * a client-supplied business_id anywhere in this flow. Fails closed:
 * an unknown key, a business that hasn't configured widget_allowed_origin
 * yet, a missing origin header, or a mismatched origin all throw the same
 * WidgetAuthError.
 */
export async function resolveBusinessFromWidgetKey(
  key: string,
  origin: string | null,
): Promise<{ businessId: string; businessName: string }> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, widget_allowed_origin")
    .eq("widget_key", key)
    .maybeSingle();

  if (error || !data) {
    throw new WidgetAuthError();
  }

  if (!data.widget_allowed_origin || !origin || origin !== data.widget_allowed_origin) {
    throw new WidgetAuthError();
  }

  return { businessId: data.id, businessName: data.name };
}
