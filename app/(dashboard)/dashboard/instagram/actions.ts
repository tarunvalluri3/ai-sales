"use server";

import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireMinRole } from "@/lib/auth";
import { disconnectInstagramNumber } from "@/lib/instagram";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type InstagramActionState = {
  error?: string;
  success?: boolean;
};

/**
 * Connecting has no Server Action -- it's a real top-level browser
 * navigation to /api/oauth/instagram/authorize (see
 * connect-instagram-button.tsx). Disconnecting is a normal in-page
 * mutation, so it stays a Server Action, same shape as
 * disconnectWhatsappAction.
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
    deletedConnectionId = await disconnectInstagramNumber(businessId);
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
