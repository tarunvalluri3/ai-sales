import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChatModel } from "@/lib/rag";
import { isWithinUsageQuota } from "@/lib/usage-limit";
import { sendWorkflowNotificationEmail } from "@/lib/notifications";
import { customerMatchesSegment } from "@/lib/segments";
import { getCustomerSnapshotForWorkflow } from "@/lib/customers";
import { logEvent } from "@/lib/logger";
import { assignNextTeamMember } from "@/lib/team-assignment";
import type {
  Workflow,
  WorkflowActionStep,
  WorkflowRun,
  WorkflowRunTargetType,
  WorkflowStep,
  WorkflowTriggerType,
} from "@/lib/supabase/types";

/**
 * The workflow engine (Phase 29). Deliberately does NOT import
 * lib/leads.ts, lib/lead-tags.ts, lib/appointments.ts, or
 * lib/conversations.ts -- those files (or the Server Actions/AI tools
 * that call them) are what call *into* this engine to fire a trigger, so
 * importing them back here would create a circular module dependency.
 * Every read/write this engine needs against those tables is done
 * directly, inline, against the injected `supabase` client instead.
 *
 * Client-injected throughout, matching lib/leads.ts's
 * `upsertLeadForConversation` convention: a trigger can originate from
 * either the widget/AI-tool path (service-role client, no Clerk session)
 * or a dashboard staff action (the Clerk-authenticated client) -- the
 * engine must run correctly under whichever one the caller already has.
 */
type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type WorkflowTarget = {
  type: WorkflowRunTargetType;
  id: string;
  customerId: string | null;
  leadId: string | null;
  conversationId: string | null;
};

const MAX_RUN_STEPS = 20;

/** Resolves a lead's own {customerId, conversationId} -- used by call sites (e.g. tag actions) that only have a leadId in hand. Returns null if the lead doesn't belong to businessId. */
export async function resolveWorkflowTargetFromLead(supabase: SupabaseClient, businessId: string, leadId: string): Promise<WorkflowTarget | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, customer_id, conversation_id")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;
  return { type: "lead", id: data.id, customerId: data.customer_id, leadId: data.id, conversationId: data.conversation_id };
}

/** Same as `resolveWorkflowTargetFromLead`, from a conversationId. */
export async function resolveWorkflowTargetFromConversation(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<WorkflowTarget | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, customer_id")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  return { type: "conversation", id: data.id, customerId: data.customer_id, leadId: null, conversationId: data.id };
}

function triggerConfigMatches(triggerType: WorkflowTriggerType, config: Workflow["trigger_config"], context: Record<string, string | number | null>): boolean {
  switch (triggerType) {
    case "lead_status_changed":
    case "appointment_status_changed":
      return !config.status || config.status === context.status;
    case "tag_added":
    case "tag_removed":
      return !config.tagId || config.tagId === context.tagId;
    case "lead_score_threshold": {
      const threshold = config.threshold ?? 0;
      const previous = typeof context.previousScore === "number" ? context.previousScore : -1;
      const next = typeof context.newScore === "number" ? context.newScore : -1;
      return previous < threshold && next >= threshold;
    }
    case "no_activity_hours":
      return true; // the sweep itself only selects rows already past config.hours
    default:
      return true;
  }
}

/**
 * The dispatcher every trigger call site invokes. Never throws -- a
 * workflow failure must never break the write path that fired it. Fires
 * every enabled workflow of this trigger type whose `trigger_config`
 * matches this specific event AND whose `conditions` match the target's
 * current customer-attribute snapshot (the same evaluator `lib/segments.ts`
 * uses for segments -- one condition language, not two).
 */
export async function dispatchWorkflowTrigger(
  supabase: SupabaseClient,
  businessId: string,
  triggerType: WorkflowTriggerType,
  target: WorkflowTarget,
  triggerContext: Record<string, string | number | null> = {},
): Promise<void> {
  try {
    const { data: workflows } = await supabase
      .from("workflows")
      .select("*")
      .eq("business_id", businessId)
      .eq("trigger_type", triggerType)
      .eq("enabled", true);

    if (!workflows || workflows.length === 0) return;

    const snapshot = target.customerId ? await getCustomerSnapshotForWorkflow(supabase, businessId, target.customerId) : null;

    for (const workflow of workflows as Workflow[]) {
      if (!triggerConfigMatches(triggerType, workflow.trigger_config, triggerContext)) continue;

      const matches = snapshot
        ? customerMatchesSegment({ matchType: workflow.match_type, conditions: workflow.conditions }, snapshot)
        : workflow.conditions.length === 0; // no customer yet (e.g. a conversation with no lead) -- only conditionless workflows can match

      if (!matches) continue;

      await createAndAdvanceWorkflowRun(supabase, businessId, workflow, triggerType, target);
    }
  } catch {
    logEvent("workflow_dispatch_failed", businessId, { triggerType }, "error");
  }
}

export async function createAndAdvanceWorkflowRun(
  supabase: SupabaseClient,
  businessId: string,
  workflow: Workflow,
  triggerType: WorkflowTriggerType,
  target: WorkflowTarget,
): Promise<void> {
  const steps = workflow.steps.slice(0, MAX_RUN_STEPS);

  const { data: run, error } = await supabase
    .from("workflow_runs")
    .insert({
      business_id: businessId,
      workflow_id: workflow.id,
      trigger_event: triggerType,
      target_type: target.type,
      target_id: target.id,
      customer_id: target.customerId,
      lead_id: target.leadId,
      conversation_id: target.conversationId,
      status: "queued",
      steps,
      next_step_index: 0,
      resume_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !run) return;

  await advanceWorkflowRun(supabase, run as WorkflowRun);
}

function waitMs(step: Extract<WorkflowStep, { type: "wait" }>): number {
  const unitMs = step.unit === "minutes" ? 60_000 : step.unit === "hours" ? 60 * 60_000 : 24 * 60 * 60_000;
  return step.amount * unitMs;
}

type ActionResult = { success: true } | { success: false; reason: string };

/**
 * Advances one run as far as it can go right now -- runs every step in
 * order starting at `next_step_index`, persisting progress after each
 * one so a crash mid-run resumes at the correct step rather than
 * repeating an already-completed one (the concrete "must never execute
 * twice" mechanism, alongside the create_task/internal_notification
 * tables' own unique (workflow_run_id, step_index) constraint for the
 * two actions that create a new row). Stops (persists `resume_at`,
 * status stays 'queued') on a `wait` step -- resumed later either by the
 * calling request's own next chance (none exists for a wait) or, in
 * practice, always by the cron sweep's `claim_due_workflow_runs()`.
 */
export async function advanceWorkflowRun(supabase: SupabaseClient, run: WorkflowRun): Promise<void> {
  let index = run.next_step_index;
  const steps = run.steps;

  while (index < steps.length) {
    const step = steps[index];

    if (step.type === "wait") {
      const resumeAt = new Date(Date.now() + waitMs(step)).toISOString();
      await supabase
        .from("workflow_runs")
        .update({ next_step_index: index + 1, resume_at: resumeAt, status: "queued" })
        .eq("id", run.id)
        .eq("business_id", run.business_id);
      return;
    }

    const result = await executeWorkflowAction(supabase, run, step, index);

    if (!result.success) {
      await supabase
        .from("workflow_runs")
        .update({ status: "failed", failure_reason: result.reason, completed_at: new Date().toISOString() })
        .eq("id", run.id)
        .eq("business_id", run.business_id);
      logEvent("workflow_run_failed", run.business_id, { workflowId: run.workflow_id, stepIndex: index, reason: result.reason });
      return;
    }

    index += 1;
    await supabase.from("workflow_runs").update({ next_step_index: index }).eq("id", run.id).eq("business_id", run.business_id);
  }

  await supabase
    .from("workflow_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("business_id", run.business_id);
}

async function executeWorkflowAction(supabase: SupabaseClient, run: WorkflowRun, step: WorkflowActionStep, stepIndex: number): Promise<ActionResult> {
  switch (step.type) {
    case "add_tag": {
      if (!run.lead_id && !run.conversation_id) return { success: false, reason: "No lead or conversation to tag." };
      const { error } = run.lead_id
        ? await supabase.from("lead_tag_assignments").insert({ business_id: run.business_id, lead_id: run.lead_id, tag_id: step.tagId })
        : await supabase.from("conversation_tag_assignments").insert({ business_id: run.business_id, conversation_id: run.conversation_id, tag_id: step.tagId });
      if (error && error.code !== "23505") return { success: false, reason: "Could not add tag." };
      return { success: true };
    }

    case "remove_tag": {
      if (run.lead_id) {
        await supabase.from("lead_tag_assignments").delete().eq("business_id", run.business_id).eq("lead_id", run.lead_id).eq("tag_id", step.tagId);
      }
      if (run.conversation_id) {
        await supabase
          .from("conversation_tag_assignments")
          .delete()
          .eq("business_id", run.business_id)
          .eq("conversation_id", run.conversation_id)
          .eq("tag_id", step.tagId);
      }
      return { success: true };
    }

    case "update_lead_status": {
      if (!run.lead_id) return { success: false, reason: "No lead to update." };
      const { error } = await supabase.from("leads").update({ status: step.status }).eq("business_id", run.business_id).eq("id", run.lead_id);
      if (error) return { success: false, reason: "Could not update lead status." };
      return { success: true };
    }

    case "flag_attention": {
      if (!run.conversation_id) return { success: false, reason: "No conversation to flag." };
      await supabase.from("conversations").update({ needs_attention: true }).eq("business_id", run.business_id).eq("id", run.conversation_id);
      return { success: true };
    }

    case "assign_owner": {
      if (!run.conversation_id) return { success: false, reason: "No conversation to assign." };
      const { data: business } = await supabase.from("businesses").select("clerk_org_id").eq("id", run.business_id).maybeSingle();
      if (!business) return { success: false, reason: "Business not found." };
      const assignedUserId = await assignNextTeamMember(run.business_id, business.clerk_org_id);
      if (assignedUserId) {
        await supabase
          .from("conversations")
          .update({ assigned_to_user_id: assignedUserId })
          .eq("business_id", run.business_id)
          .eq("id", run.conversation_id)
          .is("assigned_to_user_id", null);
      }
      return { success: true };
    }

    case "create_task": {
      const { error } = await supabase.from("sales_tasks").insert({
        business_id: run.business_id,
        title: step.title,
        description: step.description,
        customer_id: run.customer_id,
        lead_id: run.lead_id,
        conversation_id: run.conversation_id,
        workflow_run_id: run.id,
        step_index: stepIndex,
      });
      if (error && error.code !== "23505") return { success: false, reason: "Could not create task." };
      return { success: true };
    }

    case "internal_notification": {
      const { error } = await supabase.from("internal_notifications").insert({
        business_id: run.business_id,
        message: step.message,
        link: run.conversation_id ? `/dashboard/conversations/${run.conversation_id}` : run.customer_id ? `/dashboard/customers/${run.customer_id}` : null,
        workflow_run_id: run.id,
        step_index: stepIndex,
      });
      if (error && error.code !== "23505") return { success: false, reason: "Could not create notification." };
      return { success: true };
    }

    case "email_notification": {
      await sendWorkflowNotificationEmail(supabase, run.business_id, step.subject, step.message);
      return { success: true }; // best-effort by design (lib/notifications.ts), never fails the run
    }

    case "generate_followup_draft": {
      if (!run.lead_id) return { success: false, reason: "No lead to draft a follow-up for." };
      return generateFollowUpDraft(supabase, run.business_id, run.lead_id);
    }

    default:
      return { success: false, reason: "Unknown action type." };
  }
}

/**
 * Drafts a short, grounded follow-up message onto `leads.follow_up_message`
 * -- a draft only, never sent (same "AI drafts, human sends" boundary as
 * every other AI-generated message in this product). Mirrors the exact
 * single-shot `getChatModel().invoke()` pattern already used by
 * lib/tag-suggestions.ts/lib/conversation-summary.ts/lib/stalled-leads.ts,
 * rather than reaching into stalled-leads.ts's own private, differently-typed
 * helper. Idempotent: does nothing (still succeeds) if a draft already exists.
 */
async function generateFollowUpDraft(supabase: SupabaseClient, businessId: string, leadId: string): Promise<ActionResult> {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, contact_name, notes, follow_up_message")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { success: false, reason: "Lead not found." };
  if (lead.follow_up_message) return { success: true };

  const withinQuota = await isWithinUsageQuota(supabase, businessId);
  if (!withinQuota) return { success: false, reason: "Monthly AI usage quota reached." };

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();

  const contextLines = [lead.contact_name ? `Prospect's name: ${lead.contact_name}` : null, lead.notes ? `Notes: ${lead.notes}` : null]
    .filter((line): line is string => line !== null)
    .join("\n");

  const prompt = `You are drafting one short follow-up message on behalf of "${business?.name ?? "the business"}" to a prospect from an earlier conversation. Write 2-3 warm, natural sentences using ONLY the facts given below -- never invent a price, discount, availability, or promise that isn't stated. End with a soft, low-pressure question. No greeting, no sign-off. Plain text only.\n\n${contextLines || "No further context is available -- keep the message generic but warm."}`;

  try {
    const response = await getChatModel().invoke(prompt);
    const message = typeof response.content === "string" ? response.content.trim() : "";
    if (!message) return { success: false, reason: "Model returned no draft." };

    await supabase.from("leads").update({ follow_up_message: message.slice(0, 2000) }).eq("business_id", businessId).eq("id", leadId);
    return { success: true };
  } catch {
    return { success: false, reason: "AI draft generation failed." };
  }
}

const NO_ACTIVITY_CUSTOMER_LIMIT = 100;

/**
 * `no_activity_hours` is time-based, not event-based, so it can only ever
 * be checked by a periodic sweep -- this joins the shared daily cron
 * (app/api/cron/process-ingestion-queue/route.ts), same reasoning as the
 * stalled-lead follow-up sweep (lib/stalled-leads.ts) it sits next to.
 * Dedup: a workflow is not re-fired for the same customer while a run
 * already exists for that exact (workflow_id, customer) pair created
 * within the last `hours` window -- without this, a customer who stays
 * inactive would refire the same workflow every single day forever.
 */
export async function runNoActivityWorkflowSweep(): Promise<{ fired: number }> {
  const supabase = createServiceSupabaseClient();
  let fired = 0;

  try {
    const { data: workflows } = await supabase.from("workflows").select("*").eq("trigger_type", "no_activity_hours").eq("enabled", true);
    if (!workflows || workflows.length === 0) return { fired: 0 };

    for (const workflow of workflows as Workflow[]) {
      const hours = workflow.trigger_config.hours ?? 24;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data: staleCustomers } = await supabase
        .from("customers")
        .select("id")
        .eq("business_id", workflow.business_id)
        .lt("last_activity_at", cutoff)
        .limit(NO_ACTIVITY_CUSTOMER_LIMIT);

      if (!staleCustomers || staleCustomers.length === 0) continue;

      const { data: recentRuns } = await supabase
        .from("workflow_runs")
        .select("customer_id")
        .eq("workflow_id", workflow.id)
        .gte("created_at", cutoff)
        .in(
          "customer_id",
          staleCustomers.map((row) => row.id),
        );
      const recentlyFired = new Set((recentRuns ?? []).map((row) => row.customer_id));

      for (const customer of staleCustomers) {
        if (recentlyFired.has(customer.id)) continue;

        const snapshot = await getCustomerSnapshotForWorkflow(supabase, workflow.business_id, customer.id);
        if (!snapshot) continue;
        if (!customerMatchesSegment({ matchType: workflow.match_type, conditions: workflow.conditions }, snapshot)) continue;

        // Resolve the customer's most recent lead/conversation so actions
        // like `update_lead_status`/`generate_followup_draft` (which need
        // a specific lead) still work for this trigger, not just
        // customer-level actions.
        const [{ data: latestLead }, { data: latestConversation }] = await Promise.all([
          supabase
            .from("leads")
            .select("id")
            .eq("business_id", workflow.business_id)
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("conversations")
            .select("id")
            .eq("business_id", workflow.business_id)
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        await createAndAdvanceWorkflowRun(supabase, workflow.business_id, workflow, "no_activity_hours", {
          type: "customer",
          id: customer.id,
          customerId: customer.id,
          leadId: latestLead?.id ?? null,
          conversationId: latestConversation?.id ?? null,
        });
        fired += 1;
      }
    }
  } catch {
    logEvent("workflow_no_activity_sweep_failed", "unknown", {}, "error");
  }

  return { fired };
}

/**
 * Cron entrypoint (Phase 29), joins the shared daily sweep
 * (app/api/cron/process-ingestion-queue/route.ts) -- claims every
 * queued/running run whose `resume_at` has arrived (a wait step's
 * deadline, or a run whose immediate execution never got to run at all,
 * e.g. the request that created it crashed first) and resumes each one
 * from its own `next_step_index`. Same `for update skip locked` claim
 * pattern as `processWhatsappOutboundMessages()`.
 */
export async function processWorkflowRuns(): Promise<{ processed: number }> {
  const supabase = createServiceSupabaseClient();
  const { data: runs, error } = await supabase.rpc("claim_due_workflow_runs", { p_limit: 20 });

  if (error || !runs) {
    if (error) logEvent("workflow_runs_claim_failed", "unknown", {}, "error");
    return { processed: 0 };
  }

  for (const run of runs as WorkflowRun[]) {
    await advanceWorkflowRun(supabase, run);
  }

  return { processed: runs.length };
}
