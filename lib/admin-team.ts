import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PlatformAdmin } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 5 (docs/phases.md): the read side of /apache's Settings ->
 * admin team management. Owner-only mutations live in
 * lib/admin-team-actions.ts. Clerk owns identity (lib/auth.ts's own
 * comment, same reasoning as lib/admin-users.ts) -- platform_admins only
 * stores the Clerk user_id/role, so this enriches each row with the
 * admin's email for display.
 */

export type AdminTeamMember = PlatformAdmin & { email: string | null };

export async function listPlatformAdminsWithEmail(): Promise<AdminTeamMember[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("platform_admins").select("*").order("created_at", { ascending: true });

  if (error || !data) {
    console.error(JSON.stringify({ event: "admin_team_list_failed", timestamp: new Date().toISOString() }));
    return [];
  }
  if (data.length === 0) return [];

  const clerk = await clerkClient();
  const userList = await clerk.users.getUserList({ userId: data.map((a) => a.user_id), limit: data.length });
  const emailByUserId = new Map(
    userList.data.map((u) => [u.id, u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null]),
  );

  return data.map((row) => ({ ...row, email: emailByUserId.get(row.user_id) ?? null }));
}

/** Resolves a real Clerk user id from an email address, for "add admin by email" -- an admin should not have to go find a raw Clerk user id. Returns null if no user (or more than one, which Clerk itself prevents for a verified primary email) matches. */
export async function resolveClerkUserIdByEmail(email: string): Promise<string | null> {
  const clerk = await clerkClient();
  const result = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
  const match = result.data.find((u) => u.emailAddresses.some((e) => e.emailAddress.toLowerCase() === email.toLowerCase()));
  return match?.id ?? null;
}
