import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client -- bypasses RLS entirely. Restricted to the
 * public chat widget's request path (lib/widget-auth.ts, lib/rate-limit.ts,
 * and the service-role branch of lib/conversations.ts/lib/messages.ts),
 * which has no Clerk session for RLS to key off of. Every query made with
 * this client must filter explicitly by business_id -- that filter is the
 * *only* tenant boundary on this path, not defense-in-depth on top of RLS
 * (docs/security.md §3). Never used by any dashboard/Clerk-session code.
 */
export function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}
