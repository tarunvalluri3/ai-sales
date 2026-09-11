import { NextRequest, NextResponse } from "next/server";
import { completeInstagramOAuthCallback } from "@/lib/instagram";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Phase 26's OAuth callback. No Clerk session assumed -- Meta's redirect
 * here is a cross-site top-level navigation, so relying on the dashboard
 * session cookie surviving that trip would be fragile. The single-use,
 * short-lived `instagram_oauth_states` row completeInstagramOAuthCallback()
 * consumes is the entire trust mechanism: business_id (and the acting
 * user, for the audit log) come from a row this app itself created during
 * the authorize step, never from anything in this request.
 *
 * The audit-log write below uses the service-role client, not
 * lib/audit-log.ts's recordAuditLogEntry() -- that helper's
 * createServerSupabaseClient() keys off a live Clerk session for RLS,
 * which does not exist on this unauthenticated callback leg. Safe here
 * specifically because business_id/actor_user_id both come from the
 * trusted state row above, the same authorization boundary every other
 * write in this file relies on.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const deniedError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (deniedError) {
    return NextResponse.redirect(new URL("/dashboard/instagram?error=denied", request.nextUrl.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/instagram?error=invalid", request.nextUrl.origin));
  }

  try {
    const result = await completeInstagramOAuthCallback(code, state);
    if (!result.success) {
      return NextResponse.redirect(
        new URL(`/dashboard/instagram?error=${encodeURIComponent(result.error)}`, request.nextUrl.origin),
      );
    }

    const supabase = createServiceSupabaseClient();
    const { error: auditError } = await supabase.from("audit_log").insert({
      business_id: result.connection.business_id,
      actor_user_id: result.initiatedByUserId,
      action: "instagram_connection.created",
      target_type: "instagram_connection",
      target_id: result.connection.id,
    });
    if (auditError) {
      logAndGetUserMessage(auditError);
    }

    return NextResponse.redirect(new URL("/dashboard/instagram?connected=1", request.nextUrl.origin));
  } catch (error) {
    logAndGetUserMessage(error);
    return NextResponse.redirect(new URL("/dashboard/instagram?error=unexpected", request.nextUrl.origin));
  }
}
