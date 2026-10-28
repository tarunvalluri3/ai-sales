import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformAnnouncement } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 5 (docs/phases.md): the tenant-facing read for the
 * dashboard's announcement banner. Goes through the tenant's own
 * RLS-bound client (lib/supabase/server.ts) -- businessId is resolved by
 * RLS itself from the caller's Clerk session (platform_announcements'
 * `platform_announcements_select_targeted` policy, 20261105000000), never
 * passed in by the caller, matching this app's trusted-identity rule
 * (AGENTS.md §3 rule 2). Never used server-side for a cross-tenant read --
 * that is lib/admin-announcements.ts's job, through the admin client.
 */
export async function listActiveAnnouncementsForCurrentBusiness(): Promise<PlatformAnnouncement[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("platform_announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}
