import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { assignNextTeamMember } from "@/lib/team-assignment";
import { logEvent } from "@/lib/logger";

const MAX_CONVERSATIONS_PER_RUN = 50;

export type SlaRoutingResult = { checked: number; escalated: number };

/**
 * SLA-based escalation routing sweep (Phase 24) -- part of the shared
 * daily cron backstop, not its own trigger (there is no notification
 * channel yet to make a faster sweep meaningful; Phase 25 owns
 * "handoff/lead notifications that reach the team outside the browser
 * tab"). For every business with `sla_minutes` configured, finds
 * conversations still flagged `needs_attention` whose
 * `attention_flagged_at` is older than the SLA, and re-routes them to
 * the next team member in the round-robin -- the original assignee
 * missed the SLA, so escalate to someone else rather than silently
 * doing nothing. Only acts while the business is within its own
 * configured business hours (an overnight backlog for a 9-5 business
 * should not "breach" repeatedly while no one is working) -- an
 * unconfigured business (no business_hours rows) is always-open, so
 * this still functions with zero setup.
 */
export async function runSlaEscalationSweep(): Promise<SlaRoutingResult> {
  const supabase = createServiceSupabaseClient();

  const { data: businesses, error: businessesError } = await supabase
    .from("businesses")
    .select("id, clerk_org_id, sla_minutes")
    .not("sla_minutes", "is", null);

  if (businessesError || !businesses) {
    return { checked: 0, escalated: 0 };
  }

  let checked = 0;
  let escalated = 0;

  for (const business of businesses) {
    if (!business.sla_minutes) continue;

    const withinHours = await isWithinBusinessHours(supabase, business.id);
    if (!withinHours) continue;

    const overdueBefore = new Date(Date.now() - business.sla_minutes * 60 * 1000).toISOString();

    const { data: overdue } = await supabase
      .from("conversations")
      .select("id, assigned_to_user_id")
      .eq("business_id", business.id)
      .eq("needs_attention", true)
      .lt("attention_flagged_at", overdueBefore)
      .limit(MAX_CONVERSATIONS_PER_RUN);

    if (!overdue) continue;
    checked += overdue.length;

    for (const conversation of overdue) {
      const nextAssignee = await assignNextTeamMember(business.id, business.clerk_org_id);
      if (!nextAssignee || nextAssignee === conversation.assigned_to_user_id) continue;

      await supabase
        .from("conversations")
        .update({ assigned_to_user_id: nextAssignee })
        .eq("id", conversation.id);

      escalated++;
      logEvent("sla_breach_reassigned", business.id, { conversationId: conversation.id }, "error");
    }
  }

  return { checked, escalated };
}
