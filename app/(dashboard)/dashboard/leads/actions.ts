"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { updateLeadStatus, updateLeadStatusBulk } from "@/lib/leads";
import { logAndGetUserMessage } from "@/lib/errors";

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "converted", "lost"]),
});

// Caps a single bulk action to a page's worth of leads at once -- well
// above what a sales agent would ever select by hand, just a sane upper
// bound on request size rather than a real usage limit.
const bulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
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

  revalidatePath("/dashboard/leads");
  return { success: true };
}

export type BulkUpdateStatusState = {
  error?: string;
  success?: boolean;
  updatedCount?: number;
};

export async function bulkUpdateLeadStatusAction(
  _prevState: BulkUpdateStatusState,
  formData: FormData,
): Promise<BulkUpdateStatusState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:sales_agent");
  if (authError) {
    return { error: authError };
  }

  const parsed = bulkUpdateStatusSchema.safeParse({
    ids: formData.getAll("ids"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: "Invalid bulk status update." };
  }

  let updatedCount: number;
  try {
    updatedCount = await updateLeadStatusBulk(businessId, parsed.data.ids, parsed.data.status);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (updatedCount === 0) {
    return { error: "None of the selected leads could be updated." };
  }

  revalidatePath("/dashboard/leads");
  return { success: true, updatedCount };
}
