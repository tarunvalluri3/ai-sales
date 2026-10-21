import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { AuditLogAction, AuditLogEntry, AuditLogMetadata } from "@/lib/supabase/types";

/**
 * Records one row in the immutable audit trail (Phase 22) for a sensitive
 * action a business's own staff member just took. `businessId`/`actorUserId`
 * must come from `requireBusinessContext()`, never client input. Best-effort:
 * a failure to write the audit row must never break the action it's
 * recording (the action itself already succeeded by the time this is
 * called), so failures are logged and swallowed, matching
 * lib/rag.ts's ai_response_metrics write contract.
 */
export async function recordAuditLogEntry(
  businessId: string,
  actorUserId: string,
  action: AuditLogAction,
  targetType: string,
  targetId: string,
  metadata?: AuditLogMetadata,
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("audit_log").insert({
    business_id: businessId,
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "audit_log_write_failed",
        businessId,
        action,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/**
 * The actor recorded for an audit entry no person caused -- a Razorpay
 * webhook, or the daily billing sweep. `audit_log.actor_user_id` is free
 * text, so this needs no schema change, and the `system:` prefix means a
 * reader of the audit log can tell at a glance which rows a member of
 * staff caused and which the payment provider did.
 */
export const SYSTEM_ACTOR_RAZORPAY = "system:razorpay";

/**
 * Records an audit entry for a change this app made on its own, with no
 * authenticated user in the request -- Phase 17b's Razorpay webhook and
 * the daily billing sweep (lib/billing-store.ts, lib/billing-lifecycle.ts).
 *
 * Uses the **service-role** client rather than the Clerk-session one for
 * the obvious reason: there is no session. A webhook POST from Razorpay
 * and a cron invocation both run with no user, so `recordAuditLogEntry`
 * above would write nothing (its client's INSERT policy requires a
 * matching `clerk_org_id` claim).
 *
 * Best-effort, exactly like `recordAuditLogEntry`: the action being
 * recorded has already happened by the time this is called, and a failure
 * to write the trail must never undo it.
 */
export async function recordSystemAuditLogEntry(
  businessId: string,
  action: AuditLogAction,
  targetType: string,
  targetId: string,
  metadata?: AuditLogMetadata,
): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("audit_log").insert({
    business_id: businessId,
    actor_user_id: SYSTEM_ACTOR_RAZORPAY,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "audit_log_system_write_failed",
        businessId,
        action,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/** Lists the most recent audit trail entries for a business, newest first. `businessId` must come from `requireBusinessContext()`. */
export async function listAuditLogForBusiness(
  businessId: string,
  limit = 100,
): Promise<AuditLogEntry[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(
      JSON.stringify({
        event: "audit_log_read_failed",
        businessId,
        timestamp: new Date().toISOString(),
      }),
    );
    return [];
  }

  return data;
}
