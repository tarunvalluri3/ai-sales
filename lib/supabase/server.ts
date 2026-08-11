import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Per-request Supabase client authenticated as the current Clerk session,
 * via Supabase's native third-party auth (Clerk) integration. Never cache
 * or share this across requests for different users.
 */
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => (await auth()).getToken(),
    },
  );
}
