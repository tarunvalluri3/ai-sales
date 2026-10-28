import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveFlagEnabled } from "@/lib/feature-flags-rules";
import type { FeatureFlag, FeatureFlagOverride } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 5 (docs/phases.md): the general helper product code calls
 * to check a flag, plus the read side of /apache's Feature Flags section.
 * Mutations live in lib/feature-flag-actions.ts (admin-only, audited).
 *
 * `isEnabled` deliberately goes through the admin service-role client
 * rather than a tenant's RLS-bound session: feature_flags/
 * feature_flag_overrides have zero grants to anon/authenticated
 * (20261105000000), so a caller with no Clerk session at all (a cron
 * sweep, a webhook handler, the widget's own service-role path) can still
 * resolve a flag the same way a dashboard Server Action does. `tenantId`
 * is trusted because the caller already resolved it themselves (the same
 * trust tier as any other internal function taking a businessId
 * parameter, e.g. lib/admin-conversations.ts) -- this module is never
 * itself a Server Action or route handler reachable from the client.
 */

export async function isEnabled(flagKey: string, tenantId?: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient();

  const { data: flag, error: flagError } = await supabase
    .from("feature_flags")
    .select("default_enabled")
    .eq("key", flagKey)
    .maybeSingle();

  if (flagError || !flag) return false; // an unknown flag is off, never fabricated as on

  if (!tenantId) return flag.default_enabled;

  const { data: override } = await supabase
    .from("feature_flag_overrides")
    .select("enabled")
    .eq("flag_key", flagKey)
    .eq("business_id", tenantId)
    .maybeSingle();

  return resolveFlagEnabled(flag.default_enabled, override?.enabled);
}

export type FeatureFlagWithOverrides = FeatureFlag & { overrides: FeatureFlagOverride[] };

export async function listFeatureFlags(): Promise<FeatureFlagWithOverrides[]> {
  const supabase = createAdminSupabaseClient();

  const { data: flags, error } = await supabase.from("feature_flags").select("*").order("key", { ascending: true });
  if (error || !flags) {
    console.error(JSON.stringify({ event: "feature_flags_list_failed", timestamp: new Date().toISOString() }));
    return [];
  }

  const overrides =
    flags.length === 0
      ? []
      : (
          await supabase
            .from("feature_flag_overrides")
            .select("*")
            .in("flag_key", flags.map((f) => f.key))
        ).data ?? [];

  return flags.map((flag) => ({
    ...flag,
    overrides: overrides.filter((o) => o.flag_key === flag.key),
  }));
}
