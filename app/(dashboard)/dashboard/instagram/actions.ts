"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { disconnectInstagram, finishInstagramSelection } from "@/lib/instagram";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type InstagramActionState = {
  error?: string;
  success?: boolean;
};

/**
 * Connecting has no Server Action -- it's a top-level navigation to
 * /api/meta/instagram/connect. Disconnecting and choosing between several
 * shared accounts are in-page mutations.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- useActionState's (state, payload) shape; this action takes no fields. */
export async function disconnectInstagramAction(
  _prevState: InstagramActionState,
  _formData: FormData,
): Promise<InstagramActionState> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  let deletedConnectionId: string | null;
  try {
    deletedConnectionId = await disconnectInstagram(businessId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  if (!deletedConnectionId) {
    return { error: "No Instagram connection to disconnect." };
  }

  await recordAuditLogEntry(businessId, userId, "instagram_connection.deleted", "instagram_connection", deletedConnectionId);

  revalidatePath("/dashboard/instagram");
  return { success: true };
}

const selectSchema = z.object({
  selectionId: z.string().uuid(),
  accountId: z.string().regex(/^\d{1,32}$/),
});

/**
 * The client shared more than one Instagram account: connect the one it
 * picked. The business comes from the session; the pending selection is
 * read only under that business_id, so a selection id from another
 * business never matches.
 */
export async function chooseInstagramAccountAction(
  _prevState: InstagramActionState,
  formData: FormData,
): Promise<InstagramActionState> {
  const { businessId, userId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:admin");
  if (authError) {
    return { error: authError };
  }

  const parsed = selectSchema.safeParse({
    selectionId: formData.get("selectionId"),
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) {
    return { error: "Please choose an Instagram account." };
  }

  let target: string;
  try {
    const result = await finishInstagramSelection(businessId, userId, parsed.data.selectionId, parsed.data.accountId);
    target = result.kind === "connected" ? "connected=1" : `error=${result.kind === "error" ? result.error : "unexpected"}`;
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/instagram");
  redirect(`/dashboard/instagram?${target}`);
}
