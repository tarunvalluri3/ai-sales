import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Workflow, WorkflowRun, WorkflowTriggerType } from "@/lib/supabase/types";
import type { WorkflowPersistInput } from "@/lib/schemas/workflow";
import { AppError } from "@/lib/errors";

const UNIQUE_VIOLATION = "23505";
const RUN_LIST_LIMIT = 200;

/** Lists a business's workflows, alphabetical. `businessId` must come from `requireBusinessContext()`. */
export async function listWorkflowsForBusiness(businessId: string): Promise<Workflow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("Something went wrong loading workflows. Please try again.", "listWorkflowsForBusiness failed", error);
  }

  return data as Workflow[];
}

/** Lists a business's *enabled* workflows for one trigger type -- the dispatcher's only real read (lib/workflow-engine.ts). Client-injected since the widget/AI-tool path calls this under the service-role client. */
export async function listEnabledWorkflowsForTrigger(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  triggerType: WorkflowTriggerType,
): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("business_id", businessId)
    .eq("trigger_type", triggerType)
    .eq("enabled", true);

  if (error) return [];
  return data as Workflow[];
}

function toRow(input: WorkflowPersistInput) {
  return {
    name: input.name,
    description: input.description,
    trigger_type: input.triggerType,
    trigger_config: input.triggerConfig,
    match_type: input.matchType,
    conditions: input.conditions,
    steps: input.steps,
    enabled: input.enabled,
  };
}

export async function createWorkflow(businessId: string, input: WorkflowPersistInput): Promise<Workflow> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflows")
    .insert({ business_id: businessId, ...toRow(input) })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A workflow with this name already exists.", "createWorkflow duplicate name", error);
    }
    throw new AppError("Something went wrong creating this workflow. Please try again.", "createWorkflow failed", error);
  }

  return data as Workflow;
}

export async function updateWorkflow(businessId: string, id: string, input: WorkflowPersistInput): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflows")
    .update(toRow(input))
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError("A workflow with this name already exists.", "updateWorkflow duplicate name", error);
    }
    throw new AppError("Something went wrong updating this workflow. Please try again.", "updateWorkflow failed", error);
  }

  return data.length > 0;
}

/** Enables/disables a workflow without touching its definition -- a lighter-weight action than a full edit. */
export async function setWorkflowEnabled(businessId: string, id: string, enabled: boolean): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ enabled })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong updating this workflow. Please try again.", "setWorkflowEnabled failed", error);
  }

  return data.length > 0;
}

export async function deleteWorkflow(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("workflows").delete().eq("business_id", businessId).eq("id", id).select("id");

  if (error) {
    throw new AppError("Something went wrong deleting this workflow. Please try again.", "deleteWorkflow failed", error);
  }

  return data.length > 0;
}

/** Execution history across every workflow for a business, most recent first, capped at RUN_LIST_LIMIT -- the "why did/didn't this run" dashboard view. `businessId` must come from `requireBusinessContext()`. */
export async function listWorkflowRunsForBusiness(businessId: string): Promise<WorkflowRun[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(RUN_LIST_LIMIT);

  if (error) {
    throw new AppError("Something went wrong loading workflow history. Please try again.", "listWorkflowRunsForBusiness failed", error);
  }

  return data as WorkflowRun[];
}

/** Cancels a queued/running run -- the one staff-initiated mutation on run history. `false` if `id` doesn't belong to `businessId` or is already in a terminal state. */
export async function cancelWorkflowRun(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select("id");

  if (error) {
    throw new AppError("Something went wrong cancelling this run. Please try again.", "cancelWorkflowRun failed", error);
  }

  return data.length > 0;
}
