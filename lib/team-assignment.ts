import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";

const MAX_MEMBERS = 100;

/**
 * Round-robin team assignment (Phase 24). "Team" is the business's
 * existing Clerk org members -- no separate named-teams concept
 * (resolved decision). `businesses.next_assignment_cursor` is a simple
 * incrementing pointer, cycled mod the current member count; a rare
 * double-assignment under concurrent escalations is an acceptable
 * trade for not needing a lock here (this assigns *who to notify first*,
 * not an exclusive claim -- any staff member can still take over any
 * conversation regardless of who it's assigned to).
 *
 * Returns `null` (assigns nothing) for an org with zero members, which
 * should not normally happen for a business with an active conversation,
 * but fails safe rather than throwing.
 */
export async function assignNextTeamMember(businessId: string, clerkOrgId: string): Promise<string | null> {
  try {
    const clerk = await clerkClient();
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId,
      limit: MAX_MEMBERS,
    });

    const memberIds = memberships.data
      .map((membership) => membership.publicUserData?.userId)
      .filter((id): id is string => Boolean(id));

    if (memberIds.length === 0) {
      return null;
    }

    const supabase = createServiceSupabaseClient();
    const { data: business } = await supabase
      .from("businesses")
      .select("next_assignment_cursor")
      .eq("id", businessId)
      .maybeSingle();

    const cursor = (business?.next_assignment_cursor ?? 0) % memberIds.length;
    const assignedUserId = memberIds[cursor];

    await supabase
      .from("businesses")
      .update({ next_assignment_cursor: cursor + 1 })
      .eq("id", businessId);

    return assignedUserId;
  } catch {
    logEvent("team_assignment_failed", businessId, {}, "error");
    return null;
  }
}
