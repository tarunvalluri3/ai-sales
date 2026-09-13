"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { updateLeadStatus } from "@/lib/leads";
import { createTag, updateTag, deleteTag, assignTagToLead, removeTagFromLead } from "@/lib/lead-tags";
import { TAG_COLORS } from "../_components/tag-colors";
import { logAndGetUserMessage } from "@/lib/errors";
import type { RemoveTagState } from "../_components/tag-chip";
import type { DeleteState } from "../_components/delete-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchWorkflowTrigger, resolveWorkflowTargetFromLead } from "@/lib/workflow-engine";

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "converted", "lost"]),
});

export type UpdateStatusState = {
  error?: string;
  success?: boolean;
};

export async function updateLeadStatusAction(
  _prevState: UpdateStatusState,
  formData: FormData,
): Promise<UpdateStatusState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = updateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: "Invalid status update." };
  }

  let updated: boolean;
  try {
    updated = await updateLeadStatus(businessId, parsed.data.id, parsed.data.status);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This lead no longer exists." };
  }

  const supabase = createServerSupabaseClient();
  const target = await resolveWorkflowTargetFromLead(supabase, businessId, parsed.data.id);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, "lead_status_changed", target, { status: parsed.data.status });
  }

  revalidatePath("/dashboard/leads");
  return { success: true };
}

// --- Phase 27: lead tagging / segmentation ---
// Tag mutations require org:sales_agent minimum, the same tier every
// other lead-mutating action on this page already requires (StatusSelect,
// bulk status) -- not the looser "any org member" precedent D7 set for
// products/services/FAQs before this app's RBAC tiers (Phase 24) existed.
// org:analyst_viewer stays read-only for tags too, consistent with the
// rest of this page.

const tagNameSchema = z.string().trim().min(1).max(40);
const tagColorSchema = z.enum(TAG_COLORS);

const createTagSchema = z.object({ name: tagNameSchema, color: tagColorSchema });

export type TagState = {
  error?: string;
  success?: boolean;
};

export async function createTagAction(_prevState: TagState, formData: FormData): Promise<TagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = createTagSchema.safeParse({ name: formData.get("name"), color: formData.get("color") });
  if (!parsed.success) {
    return { error: "Enter a tag name (up to 40 characters)." };
  }

  try {
    await createTag(businessId, parsed.data.name, parsed.data.color);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/conversations", "layout");
  return { success: true };
}

const updateTagSchema = z.object({ id: z.string().uuid(), name: tagNameSchema, color: tagColorSchema });

export async function updateTagAction(_prevState: TagState, formData: FormData): Promise<TagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = updateTagSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { error: "Enter a tag name (up to 40 characters)." };
  }

  let updated: boolean;
  try {
    updated = await updateTag(businessId, parsed.data.id, parsed.data.name, parsed.data.color);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!updated) {
    return { error: "This tag no longer exists." };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/conversations", "layout");
  return { success: true };
}

export async function deleteTagAction(_prevState: DeleteState, formData: FormData): Promise<DeleteState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const id = formData.get("id");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  let deleted: boolean;
  try {
    deleted = await deleteTag(businessId, parsed.data);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deleted) {
    return { error: "This tag no longer exists." };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/conversations", "layout");
  return { success: true };
}

const leadTagAssignmentSchema = z.object({ leadId: z.string().uuid(), tagId: z.string().uuid() });

export async function assignTagToLeadAction(_prevState: TagState, formData: FormData): Promise<TagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = leadTagAssignmentSchema.safeParse({
    leadId: formData.get("leadId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    await assignTagToLead(businessId, parsed.data.leadId, parsed.data.tagId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  const supabase = createServerSupabaseClient();
  const target = await resolveWorkflowTargetFromLead(supabase, businessId, parsed.data.leadId);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, "tag_added", target, { tagId: parsed.data.tagId });
  }

  revalidatePath("/dashboard/leads");
  return { success: true };
}

export async function removeTagFromLeadAction(
  _prevState: RemoveTagState,
  formData: FormData,
): Promise<RemoveTagState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = leadTagAssignmentSchema.safeParse({
    leadId: formData.get("leadId"),
    tagId: formData.get("tagId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    await removeTagFromLead(businessId, parsed.data.leadId, parsed.data.tagId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  const supabase = createServerSupabaseClient();
  const target = await resolveWorkflowTargetFromLead(supabase, businessId, parsed.data.leadId);
  if (target) {
    await dispatchWorkflowTrigger(supabase, businessId, "tag_removed", target, { tagId: parsed.data.tagId });
  }

  revalidatePath("/dashboard/leads");
  return { success: true };
}
