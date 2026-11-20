import "server-only";
import { createHash } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WidgetKey } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

/** Lists every widget key (active and revoked) for a business, newest first. `businessId` must come from `requireBusinessContext()`. */
export async function listWidgetKeysForBusiness(businessId: string): Promise<WidgetKey[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError(
      "Something went wrong loading your widget keys. Please try again.",
      "listWidgetKeysForBusiness failed",
      error,
    );
  }

  return data;
}

/**
 * Creates a new active widget key for a business (Phase 24 rotation
 * flow: generate a new key alongside any existing active ones, update
 * the embedded snippet, confirm it works, then revoke the old key --
 * never a hard cutover). `allowedOrigins` may start empty; the key
 * simply rejects every request (fails closed, same contract as the old
 * single-key design) until at least one origin is added.
 */
export async function createWidgetKey(
  businessId: string,
  allowedOrigins: string[],
  name?: string | null,
): Promise<WidgetKey> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .insert({ business_id: businessId, allowed_origins: allowedOrigins, name: name?.trim() || null })
    .select()
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong creating this widget key. Please try again.",
      "createWidgetKey failed",
      error,
    );
  }

  return data;
}

/** Updates a widget key's allowed origins and nickname, scoped to the given business. Returns `false` for a cross-tenant or nonexistent id. */
export async function updateWidgetKeyOrigins(
  businessId: string,
  id: string,
  allowedOrigins: string[],
  name?: string | null,
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .update({ allowed_origins: allowedOrigins, name: name?.trim() || null })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "active")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong updating this widget key. Please try again.",
      "updateWidgetKeyOrigins failed",
      error,
    );
  }

  return data.length > 0;
}

/** Revokes a widget key, scoped to the given business. Revocation is permanent -- no un-revoke, matching a rotated-out key's intended one-way lifecycle. Returns `false` for a cross-tenant, nonexistent, or already-revoked id. */
export async function revokeWidgetKey(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("widget_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("status", "active")
    .select("id");

  if (error) {
    throw new AppError(
      "Something went wrong revoking this widget key. Please try again.",
      "revokeWidgetKey failed",
      error,
    );
  }

  return data.length > 0;
}

export async function ensureWidgetKey(businessId: string, origin: string | null) {
  const keys = await listWidgetKeysForBusiness(businessId);
  const active = keys.find((key) => key.status === "active" && origin && key.allowed_origins.includes(origin))
    ?? keys.find((key) => key.status === "active");
  if (active) return { key: active, created: false };

  // Concurrent onboarding submits for the same business and key generation
  // share a primary key. The public embed key still uses its random DB default.
  const hex = createHash("sha256").update("onboarding-widget:" + businessId + ":" + (keys[0]?.id ?? "")).digest("hex");
  const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("widget_keys")
    .upsert({ id, business_id: businessId, name: "Website widget", allowed_origins: origin ? [origin] : [] }, { onConflict: "id", ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) throw new AppError("Could not set up your website widget. Try again.", "ensureWidgetKey failed", error);
  if (data) return { key: data, created: true };

  const raced = (await listWidgetKeysForBusiness(businessId)).find((key) => key.id === id && key.status === "active");
  if (!raced) throw new AppError("Could not set up your website widget. Try again.", "ensureWidgetKey conflict");
  return { key: raced, created: false };
}
