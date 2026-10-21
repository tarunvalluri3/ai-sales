import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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

// The system-actor entry points live in lib/audit-log-system.ts so that code
// which runs OUTSIDE Next.js -- scripts/issue-credit-note.mjs -- can write
// audit rows without loading this module's Clerk-session client, which Node
// cannot import on its own. Re-exported here so every existing import of
// `recordSystemAuditLogEntry` / `SYSTEM_ACTOR_RAZORPAY` is unchanged.
export { recordSystemAuditLogEntry, SYSTEM_ACTOR_RAZORPAY } from "@/lib/audit-log-system";

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
