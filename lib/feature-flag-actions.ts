"use server";

import { z } from "zod";
import { requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import { isValidFlagKey } from "@/lib/feature-flags-rules";
import type { ActionResult } from "@/lib/admin-tenant-actions";

/**
 * Phase 33 Stop 5 (docs/phases.md): mutations for /apache's Feature Flags
 * section. Same contract as every other admin Server Action in this app
 * (lib/admin-tenant-actions.ts's own header): re-checks
 * requirePlatformAdminStepUp itself, rate-limited, audited, returns
 * ActionResult. Creating/toggling a flag or setting a tenant override is
 * support-role; deleting a flag outright (something product code may
 * still call isEnabled() for) is owner-only.
 */

async function rateLimitOrFail(userId: string): Promise<string | null> {
  const allowed = await checkAdminMutationRateLimit(userId);
  if (!allowed) return "Too many admin actions in a short time. Wait a few minutes and try again.";
  return null;
}

const createFlagSchema = z.object({
  key: z.string().refine(isValidFlagKey, "Key must be lowercase, dot-separated segments (e.g. widget.new_chat_bubble)."),
  description: z.string().trim().min(3).max(300),
  defaultEnabled: z.boolean(),
});

export async function createFeatureFlag(input: { key: string; description: string; defaultEnabled: boolean }): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const parsed = createFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("feature_flags").insert({
    key: parsed.data.key,
    description: parsed.data.description,
    default_enabled: parsed.data.defaultEnabled,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A flag with this key already exists." };
    return { ok: false, error: "Could not create this flag. Please try again." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "feature_flag.created", "feature_flag", parsed.data.key, {
    after: { description: parsed.data.description, default_enabled: parsed.data.defaultEnabled },
  });
  return { ok: true };
}

export async function setFeatureFlagDefault(key: string, defaultEnabled: boolean): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("feature_flags").select("default_enabled").eq("key", key).maybeSingle();
  if (!before) return { ok: false, error: "This flag no longer exists." };

  const { error } = await supabase.from("feature_flags").update({ default_enabled: defaultEnabled, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) return { ok: false, error: "Could not update this flag. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "feature_flag.default_changed", "feature_flag", key, {
    before: { default_enabled: before.default_enabled },
    after: { default_enabled: defaultEnabled },
  });
  return { ok: true };
}

export async function setTenantFlagOverride(flagKey: string, businessId: string, enabled: boolean): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase
    .from("feature_flag_overrides")
    .select("enabled")
    .eq("flag_key", flagKey)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("feature_flag_overrides")
    .upsert({ flag_key: flagKey, business_id: businessId, enabled, updated_by: admin.user_id, updated_at: new Date().toISOString() });

  if (error) return { ok: false, error: "Could not set this override. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "feature_flag.override_set", "feature_flag", flagKey, {
    businessId,
    before: { enabled: before?.enabled ?? null },
    after: { enabled },
  });
  return { ok: true };
}

export async function clearTenantFlagOverride(flagKey: string, businessId: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("feature_flag_overrides").delete().eq("flag_key", flagKey).eq("business_id", businessId);
  if (error) return { ok: false, error: "Could not clear this override. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "feature_flag.override_cleared", "feature_flag", flagKey, { businessId });
  return { ok: true };
}

/** Owner-only: deletes a flag outright, cascading its overrides -- product code calling isEnabled() for a deleted key just gets `false` back (lib/feature-flags.ts), never an error. */
export async function deleteFeatureFlag(key: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const reasonCheck = z.string().trim().min(3).max(500).safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: "A reason is required." };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("feature_flags").delete().eq("key", key);
  if (error) return { ok: false, error: "Could not delete this flag. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "feature_flag.deleted", "feature_flag", key, { after: { reason: reasonCheck.data } });
  return { ok: true };
}
