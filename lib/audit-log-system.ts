import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { AuditLogAction, AuditLogMetadata } from "@/lib/supabase/types";

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
