"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { createWorkflow, updateWorkflow, deleteWorkflow, setWorkflowEnabled, cancelWorkflowRun } from "@/lib/workflows";
import { workflowPersistSchema, type WorkflowPersistInput } from "@/lib/schemas/workflow";
import { setSalesTaskStatus, createSalesTask } from "@/lib/sales-tasks";
import { markInternalNotificationRead } from "@/lib/internal-notifications";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";
import type { DeleteState } from "../_components/delete-button";

export type ActionState = { error?: string; success?: boolean };

function parseWorkflowForm(formData: FormData): { success: true; data: WorkflowPersistInput } | { success: false } {
  const name = formData.get("name");
  const description = formData.get("description");
  const definition = formData.get("definition");

  if (typeof name !== "string" || typeof definition !== "string") return { success: false };

  let parsedDefinition: unknown;
  try {
    parsedDefinition = JSON.parse(definition);
  } catch {
    return { success: false };
  }
  if (typeof parsedDefinition !== "object" || parsedDefinition === null) return { success: false };

  const parsed = workflowPersistSchema.safeParse({
    name,
    description: typeof description === "string" && description.trim().length > 0 ? description : null,
    ...(parsedDefinition as Record<string, unknown>),
  });
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export async function createWorkflowAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = parseWorkflowForm(formData);
  if (!parsed.success) return { error: "Add a trigger and at least one step." };

  let workflow;
  try {
    workflow = await createWorkflow(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "workflow.created", "workflow", workflow.id, { name: workflow.name });
  revalidatePath("/dashboard/workflows");
  return { success: true };
}

export async function updateWorkflowAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const idParsed = z.string().uuid().safeParse(formData.get("id"));
  if (!idParsed.success) return { error: "Invalid request." };

  const parsed = parseWorkflowForm(formData);
  if (!parsed.success) return { error: "Add a trigger and at least one step." };

  let updated: boolean;
  try {
    updated = await updateWorkflow(businessId, idParsed.data, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
  if (!updated) return { error: "This workflow no longer exists." };

  await recordAuditLogEntry(businessId, userId, "workflow.updated", "workflow", idParsed.data, { name: parsed.data.name });
  revalidatePath("/dashboard/workflows");
  return { success: true };
}

const enabledSchema = z.object({ id: z.string().uuid(), enabled: z.enum(["true", "false"]) });

export async function setWorkflowEnabledAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = enabledSchema.safeParse({ id: formData.get("id"), enabled: formData.get("enabled") });
  if (!parsed.success) return { error: "Invalid request." };

  const enabled = parsed.data.enabled === "true";
  let updated: boolean;
  try {
    updated = await setWorkflowEnabled(businessId, parsed.data.id, enabled);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
  if (!updated) return { error: "This workflow no longer exists." };

  await recordAuditLogEntry(businessId, userId, enabled ? "workflow.enabled" : "workflow.disabled", "workflow", parsed.data.id);
  revalidatePath("/dashboard/workflows");
  return { success: true };
}

export async function deleteWorkflowAction(_prevState: DeleteState, formData: FormData): Promise<DeleteState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "Invalid request." };

  let deleted: boolean;
  try {
    deleted = await deleteWorkflow(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
  if (!deleted) return { error: "This workflow no longer exists." };

  await recordAuditLogEntry(businessId, userId, "workflow.deleted", "workflow", parsed.data);
  revalidatePath("/dashboard/workflows");
  return { success: true };
}

export async function cancelWorkflowRunAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "Invalid request." };

  let cancelled: boolean;
  try {
    cancelled = await cancelWorkflowRun(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
  if (!cancelled) return { error: "This run can no longer be cancelled." };

  await recordAuditLogEntry(businessId, userId, "workflow_run.cancelled", "workflow_run", parsed.data);
  revalidatePath("/dashboard/workflows");
  return { success: true };
}

// --- Sales tasks (manual, org:sales_agent minimum -- same tier as every other lead-mutating action) ---

const createTaskSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullable() });

export async function createSalesTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const description = formData.get("description");
  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: typeof description === "string" && description.trim().length > 0 ? description : null,
  });
  if (!parsed.success) return { error: "Enter a task title." };

  try {
    await createSalesTask(businessId, parsed.data.title, parsed.data.description);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/workflows");
  return { success: true };
}

const taskStatusSchema = z.object({ id: z.string().uuid(), status: z.enum(["open", "done", "dismissed"]) });

export async function setSalesTaskStatusAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const parsed = taskStatusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { error: "Invalid request." };

  let updated: boolean;
  try {
    updated = await setSalesTaskStatus(businessId, parsed.data.id, parsed.data.status);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
  if (!updated) return { error: "This task no longer exists." };

  revalidatePath("/dashboard/workflows");
  return { success: true };
}

export async function markNotificationReadAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) return { error: authError };

  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "Invalid request." };

  try {
    await markInternalNotificationRead(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/workflows");
  return { success: true };
}
