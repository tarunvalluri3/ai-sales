import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client reserved for the /apache platform-admin
 * panel (Phase 33, docs/phases.md). Bypasses RLS entirely -- this is what
 * lets a platform admin read across every tenant's data, which no
 * clerk_org_id-keyed RLS policy is designed to allow. Every query made
 * with this client must still be scoped deliberately by the caller (a
 * specific business_id for a tenant-detail page, a specific id for a
 * mutation) -- there is no RLS backstop here, only
 * lib/platform-admin.ts's requirePlatformAdmin() gate that must run
 * before this client is ever touched.
 *
 * Deliberately a SEPARATE module from lib/supabase/service.ts, which is
 * documented as restricted to the public chat widget's unauthenticated
 * request path. Conflating the two would blur which trust boundary a
 * given service-role query is operating under; this file exists so
 * "admin cross-tenant access" and "widget has-no-session access" are
 * never the same code path.
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}
