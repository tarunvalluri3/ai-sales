import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PlatformAnnouncement } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 5 (docs/phases.md): the admin-side read for /apache's
 * Support Tools page (lists every announcement, active or not). The
 * tenant-facing read is NOT here -- it goes through a tenant's own
 * RLS-bound session (lib/announcements.ts), since platform_announcements
 * grants SELECT to authenticated with a targeting policy
 * (20261105000000). Mutations live in lib/admin-announcement-actions.ts.
 */

const ANNOUNCEMENT_LIST_LIMIT = 200;

export async function listAnnouncements(): Promise<PlatformAnnouncement[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("platform_announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(ANNOUNCEMENT_LIST_LIMIT);

  if (error || !data) {
    console.error(JSON.stringify({ event: "admin_announcements_list_failed", timestamp: new Date().toISOString() }));
    return [];
  }
  return data;
}
