"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { renameCustomer, addTagToCustomer, removeTagFromCustomer } from "@/lib/customers";
import { createSegment, updateSegment, deleteSegment } from "@/lib/segments";
import { segmentPersistSchema, type SegmentPersistInput } from "@/lib/schemas/segment";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchWorkflowTrigger } from "@/lib/workflow-engine";
import type { RemoveTagState } from "../_components/tag-chip";
import type { TagPickerState } from "../_components/tag-picker";
import type { DeleteState } from "../_components/delete-button";

export type ActionState = { error?: string; success?: boolean };

const renameSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(200),
});

/** Renames a customer's display name. org:sales_agent minimum -- same tier every other customer/lead-mutating action on this app requires. */
export async function renameCustomerAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const parsed = renameSchema.safeParse({ id: formData.get("id"), displayName: formData.get("displayName") });
  if (!parsed.success) return { error: "Enter a name." };

  let updated: boolean;
  try {
    updated = await renameCustomer(businessId, parsed.data.id, parsed.data.displayName);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) return { error: "This customer no longer exists." };

  await recordAuditLogEntry(businessId, userId, "customer.renamed", "customer", parsed.data.id, {
    displayName: parsed.data.displayName,
  });

  revalidatePath("/dashboard/customers");
  return { success: true };
}

const customerTagSchema = z.object({ customerId: z.string().uuid(), tagId: z.string().uuid() });

export async function addTagToCustomerAction(_prevState: TagPickerState, formData: FormData): Promise<TagPickerState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const parsed = customerTagSchema.safeParse({
    customerId: formData.get("customerId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  try {
    const applied = await addTagToCustomer(businessId, parsed.data.customerId, parsed.data.tagId);
    if (!applied) return { error: "This customer has no lead or conversation to tag yet." };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  // Phase 29: `tag_added` trigger. Target carries only `customerId` here
  // (not a specific lead/conversation id, since `addTagToCustomer`
  // resolves that internally) -- condition evaluation still works fully
  // (it runs against the customer snapshot), but a downstream action
  // needing a specific lead/conversation (e.g. `flag_attention`) will
  // no-op for a workflow fired from this particular entry point. Known,
  // accepted scope limit -- the primary tag surfaces (Leads,
  // Conversations) always carry full ids.
  const supabase = createServerSupabaseClient();
  await dispatchWorkflowTrigger(
    supabase,
    businessId,
    "tag_added",
    { type: "customer", id: parsed.data.customerId, customerId: parsed.data.customerId, leadId: null, conversationId: null },
    { tagId: parsed.data.tagId },
  );

  revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
  return { success: true };
}

export async function removeTagFromCustomerAction(_prevState: RemoveTagState, formData: FormData): Promise<RemoveTagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) return { error: authError };

  const parsed = customerTagSchema.safeParse({
    customerId: formData.get("customerId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  try {
    await removeTagFromCustomer(businessId, parsed.data.customerId, parsed.data.tagId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  const supabase = createServerSupabaseClient();
  await dispatchWorkflowTrigger(
    supabase,
    businessId,
    "tag_removed",
    { type: "customer", id: parsed.data.customerId, customerId: parsed.data.customerId, leadId: null, conversationId: null },
    { tagId: parsed.data.tagId },
  );

  revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
  return { success: true };
}

// --- Segments (Phase 28) ---
// Create/edit/delete requires org:admin, per the task's "Admin: manage
// segments" role expectation -- a stricter tier than tags' org:sales_agent,
// since a segment can drive Phase 29's automations once those exist.

const segmentFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable(),
  rule: z.string(),
});

function parseSegmentForm(formData: FormData): { success: true; data: SegmentPersistInput } | { success: false } {
  const description = formData.get("description");
  const raw = segmentFormSchema.safeParse({
    name: formData.get("name"),
    description: typeof description === "string" && description.trim().length > 0 ? description : null,
    rule: formData.get("rule"),
  });
  if (!raw.success) return { success: false };

  let rule: unknown;
  try {
    rule = JSON.parse(raw.data.rule);
  } catch {
    return { success: false };
  }

  const parsed = segmentPersistSchema.safeParse({ name: raw.data.name, description: raw.data.description, rule });
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export async function createSegmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = parseSegmentForm(formData);
  if (!parsed.success) return { error: "Add at least one valid condition." };

  let segment;
  try {
    segment = await createSegment(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  await recordAuditLogEntry(businessId, userId, "segment.created", "segment", segment.id, { name: segment.name });

  revalidatePath("/dashboard/customers");
  return { success: true };
}

export async function updateSegmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const id = formData.get("id");
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { error: "Invalid request." };

  const parsed = parseSegmentForm(formData);
  if (!parsed.success) return { error: "Add at least one valid condition." };

  let updated: boolean;
  try {
    updated = await updateSegment(businessId, idParsed.data, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) return { error: "This segment no longer exists." };

  await recordAuditLogEntry(businessId, userId, "segment.updated", "segment", idParsed.data, { name: parsed.data.name });

  revalidatePath("/dashboard/customers");
  return { success: true };
}

export async function deleteSegmentAction(_prevState: DeleteState, formData: FormData): Promise<DeleteState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) return { error: authError };

  const parsed = z.string().uuid().safeParse(formData.get("id"));
  if (!parsed.success) return { error: "Invalid request." };

  let deleted: boolean;
  try {
    deleted = await deleteSegment(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) return { error: "This segment no longer exists." };

  await recordAuditLogEntry(businessId, userId, "segment.deleted", "segment", parsed.data);

  revalidatePath("/dashboard/customers");
  return { success: true };
}
