import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Phase 33 Stop 2 (docs/phases.md): cross-tenant end-user listing for the
 * /apache Users page. There is no local `users` table (lib/auth.ts's own
 * comment) -- Clerk owns identity and org membership entirely, so this
 * reads live from Clerk's Backend API, same client/pattern as
 * lib/team-assignment.ts's existing getOrganizationMembershipList() call.
 *
 * Capped at MAX_BUSINESSES_SCANNED businesses (one Clerk API call each,
 * run in parallel) to bound real-world Clerk Backend API rate limits for
 * this early-stage pilot -- noted as a known limitation, not a page-size
 * concern (STATE.md). A user belonging to more than one business appears
 * once per membership, which is correct: role is a per-tenant concept.
 */

const MAX_BUSINESSES_SCANNED = 100;
const MAX_MEMBERS_PER_BUSINESS = 100;

export type AdminUserRow = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  businessId: string;
  businessName: string;
  role: string;
  lastSignInAt: number | null;
  twoFactorEnabled: boolean;
  banned: boolean;
};

export async function listUsersAcrossTenants(): Promise<AdminUserRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data: businesses, error } = await supabase
    .from("businesses")
    .select("id, name, clerk_org_id")
    .order("created_at", { ascending: false })
    .limit(MAX_BUSINESSES_SCANNED);

  if (error || !businesses) {
    console.error(JSON.stringify({ event: "admin_users_list_businesses_failed", timestamp: new Date().toISOString() }));
    return [];
  }

  const clerk = await clerkClient();

  const membershipResults = await Promise.allSettled(
    businesses.map(async (business) => {
      const memberships = await clerk.organizations.getOrganizationMembershipList({
        organizationId: business.clerk_org_id,
        limit: MAX_MEMBERS_PER_BUSINESS,
      });
      return { business, memberships: memberships.data };
    }),
  );

  type MembershipRow = { businessId: string; businessName: string; userId: string; role: string };
  const membershipRows: MembershipRow[] = [];
  for (const result of membershipResults) {
    if (result.status !== "fulfilled") continue;
    for (const membership of result.value.memberships) {
      const userId = membership.publicUserData?.userId;
      if (!userId) continue;
      membershipRows.push({
        businessId: result.value.business.id,
        businessName: result.value.business.name,
        userId,
        role: membership.role,
      });
    }
  }

  const uniqueUserIds = [...new Set(membershipRows.map((r) => r.userId))];
  if (uniqueUserIds.length === 0) return [];

  const userList = await clerk.users.getUserList({ userId: uniqueUserIds, limit: uniqueUserIds.length });
  const usersById = new Map(userList.data.map((u) => [u.id, u]));

  return membershipRows.map((row) => {
    const user = usersById.get(row.userId);
    const primaryEmail = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "unknown";
    return {
      userId: row.userId,
      email: primaryEmail,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      businessId: row.businessId,
      businessName: row.businessName,
      role: row.role,
      lastSignInAt: user?.lastSignInAt ?? null,
      twoFactorEnabled: user?.twoFactorEnabled ?? false,
      banned: user?.banned ?? false,
    };
  });
}
