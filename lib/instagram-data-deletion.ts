import "server-only";
import crypto from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { INSTAGRAM_CONVERSATION_SOURCE } from "@/lib/instagram";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Meta's two account-removal callbacks (app review requirement):
 *
 *  - deauthorize: the account owner removed the app in Instagram. We stop
 *    using the account at once: delete the access token and mark the
 *    connection `disconnected`. Message history is left to the business.
 *  - data deletion: the owner asked Meta to delete the data we hold. We
 *    also delete the connection row and every Instagram-sourced
 *    conversation (messages, captured leads and queued outbound replies
 *    cascade from `conversations`) for that business.
 *
 * `instagramUserId` has already been proven genuine by
 * verifyMetaSignedRequest(). Every write below is scoped to the
 * `business_id` read off the matched connection -- never to anything in the
 * request. Never logs tokens or message content: only ids and counts.
 */

const CONFIRMATION_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type DeletionStatus = "pending" | "completed" | "failed";

async function findConnection(
  supabase: ServiceSupabaseClient,
  instagramUserId: string,
): Promise<{ id: string; business_id: string } | null> {
  const { data, error } = await supabase
    .from("instagram_connections")
    .select("id, business_id")
    .or(
      `instagram_business_account_id.eq.${instagramUserId},instagram_app_scoped_user_id.eq.${instagramUserId}`,
    )
    .limit(1)
    .maybeSingle<{ id: string; business_id: string }>();
  if (error) throw new Error("instagram connection lookup failed");
  return data;
}

/** Deletes the token and marks the connection disconnected. Returns whether a connection matched. */
export async function deauthorizeInstagramUser(
  supabase: ServiceSupabaseClient,
  instagramUserId: string,
): Promise<boolean> {
  const connection = await findConnection(supabase, instagramUserId);
  if (!connection) return false;

  const { error: tokenError } = await supabase
    .from("instagram_credentials")
    .delete()
    .eq("business_id", connection.business_id);
  if (tokenError) throw new Error("instagram token delete failed");

  const { error: updateError } = await supabase
    .from("instagram_connections")
    .update({
      status: "disconnected",
      access_token_last4: null,
      token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("business_id", connection.business_id);
  if (updateError) throw new Error("instagram connection update failed");

  logEvent("instagram_deauthorized", connection.business_id, {});
  return true;
}

/** Records a request, returning the confirmation code Meta shows the person. */
export async function createDeletionRequest(
  supabase: ServiceSupabaseClient,
  instagramUserId: string,
): Promise<string> {
  const confirmationCode = crypto.randomBytes(18).toString("base64url");
  const { error } = await supabase
    .from("instagram_data_deletion_requests")
    .insert({ confirmation_code: confirmationCode, instagram_user_id: instagramUserId });
  if (error) throw new Error("instagram deletion request insert failed");
  return confirmationCode;
}

/** Runs the deletion for a recorded request and settles its status. Never throws. */
export async function runInstagramDataDeletion(
  supabase: ServiceSupabaseClient,
  confirmationCode: string,
  instagramUserId: string,
): Promise<void> {
  let businessId: string | null = null;
  try {
    const connection = await findConnection(supabase, instagramUserId);

    if (connection) {
      businessId = connection.business_id;
      const scoped = connection.business_id;

      // Token first, so nothing can send or refresh once we begin.
      const steps = [
        supabase.from("instagram_credentials").delete().eq("business_id", scoped),
        supabase.from("instagram_oauth_states").delete().eq("business_id", scoped),
        supabase
          .from("conversations")
          .delete()
          .eq("business_id", scoped)
          .eq("source", INSTAGRAM_CONVERSATION_SOURCE),
        supabase.from("instagram_inbound_messages").delete().eq("business_id", scoped),
        supabase.from("instagram_connections").delete().eq("id", connection.id).eq("business_id", scoped),
      ];
      for (const step of steps) {
        const { error } = await step;
        if (error) throw new Error("instagram data deletion step failed");
      }
    }

    const { error } = await supabase
      .from("instagram_data_deletion_requests")
      .update({ status: "completed", completed_at: new Date().toISOString(), business_id: businessId })
      .eq("confirmation_code", confirmationCode);
    if (error) throw new Error("instagram deletion request update failed");

    logEvent("instagram_data_deleted", businessId ?? "unknown", { matched: businessId !== null });
  } catch {
    logEvent("instagram_data_deletion_failed", businessId ?? "unknown", {}, "error");
    await supabase
      .from("instagram_data_deletion_requests")
      .update({ status: "failed" })
      .eq("confirmation_code", confirmationCode);
  }
}

export type DeletionRequestStatus = {
  status: DeletionStatus;
  requestedAt: string;
  completedAt: string | null;
};

/** Public status lookup by confirmation code. Returns null for a malformed or unknown code. */
export async function getDeletionRequestStatus(
  supabase: ServiceSupabaseClient,
  code: string,
): Promise<DeletionRequestStatus | null> {
  if (!CONFIRMATION_CODE_PATTERN.test(code)) return null;
  const { data } = await supabase
    .from("instagram_data_deletion_requests")
    .select("status, created_at, completed_at")
    .eq("confirmation_code", code)
    .maybeSingle<{ status: DeletionStatus; created_at: string; completed_at: string | null }>();
  if (!data) return null;
  return { status: data.status, requestedAt: data.created_at, completedAt: data.completed_at };
}
