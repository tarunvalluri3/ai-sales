"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { updateLeadStatus } from "@/lib/leads";
import { logAndGetUserMessage } from "@/lib/errors";

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

  revalidatePath("/dashboard/leads");
  return { success: true };
}
