import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { assignNextTeamMember } from "@/lib/team-assignment";
import { logEvent } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notification-dispatch";
import { getAppUrl } from "@/lib/app-url";

const MAX_CONVERSATIONS_PER_RUN = 50;

/**
 * How many breaches get their own notification before the rest are rolled into
 * one summary row. Without this a bad day means up to MAX_CONVERSATIONS_PER_RUN
 * notifications -- and, for a business that opted this category into immediate
 * email, that many emails in one run.
 */
const MAX_BREACH_NOTIFICATIONS_PER_BUSINESS = 5;

export type SlaRoutingResult = { checked: number; escalated: number };

/**
 * SLA-based escalation routing sweep (Phase 24) -- part of the shared
 * daily cron backstop rather than its own trigger. (It stayed daily
 * originally because there was no notification channel to make a faster sweep
 * meaningful. As of 2026-10-21 there is one -- each breach now notifies
 * through lib/notification-dispatch.ts -- so a faster sweep is finally worth
 * considering, but changing the cadence is a separate decision and is NOT done
 * here.) For every business with `sla_minutes` configured, finds
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

    let notifiedThisBusiness = 0;
    let escalatedThisBusiness = 0;

    for (const conversation of overdue) {
      const nextAssignee = await assignNextTeamMember(business.id, business.clerk_org_id);
      if (!nextAssignee || nextAssignee === conversation.assigned_to_user_id) continue;

      await supabase
        .from("conversations")
        .update({ assigned_to_user_id: nextAssignee })
        .eq("id", conversation.id);

      escalated++;
      escalatedThisBusiness++;
      logEvent("sla_breach_reassigned", business.id, { conversationId: conversation.id }, "error");

      // Awaited, not after(): this is a cron handler, so deferring past the
      // response would only hide the work from the run's own result.
      if (notifiedThisBusiness < MAX_BREACH_NOTIFICATIONS_PER_BUSINESS) {
        notifiedThisBusiness++;
        const link = `/dashboard/conversations/${conversation.id}`;
        await dispatchNotification({
          businessId: business.id,
          category: "sla_breach",
          message: "A conversation passed its response-time target and was reassigned.",
          link,
          supabase,
          email: {
            subject: "A conversation missed its response target",
            heading: "A conversation breached your SLA",
            paragraphs: ["It has been reassigned to the next person in your team rotation."],
            cta: { label: "Open the conversation", url: `${getAppUrl()}${link}` },
          },
        });
      }
    }

    // One aggregate row for the tail, with no email payload, so a bad day
    // cannot turn into fifty separate alerts.
    const unnotified = escalatedThisBusiness - notifiedThisBusiness;
    if (unnotified > 0) {
      await dispatchNotification({
        businessId: business.id,
        category: "sla_breach",
        message: `${unnotified} more conversations passed their response-time target and were reassigned.`,
        link: "/dashboard/conversations",
        supabase,
      });
    }
  }

  return { checked, escalated };
}
