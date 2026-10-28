import "server-only";
import { headers } from "next/headers";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AdminAuditLogMetadata } from "@/lib/supabase/types";

/**
 * Append-only audit trail for the /apache platform-admin panel (Phase 33,
 * docs/phases.md). Separate from lib/audit-log.ts -- see
 * 20261102000100_create_admin_audit_log.sql for why. `actorUserId` must
 * come from requirePlatformAdmin()'s returned context, never client input.
 *
 * Every mutation AND every view of customer conversation content must call
 * this (the approved security brief, item 7) -- call sites: tenant
 * actions, billing mutations, impersonation start/stop, PII reveals, and
 * every conversation-transcript open in the support-view pages.
 *
 * Best-effort: a failed audit write must never roll back or mask the
 * result of the action it is recording, matching lib/audit-log.ts's own
 * contract -- but unlike that module, a failure here is logged at ERROR
 * level (reaches Sentry via lib/logger.ts's logEvent), because a missed
 * platform-admin audit row is a materially bigger gap than a missed
 * tenant-staff one.
 */
export async function recordAdminAuditLogEntry(
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  options?: {
    businessId?: string | null;
    before?: AdminAuditLogMetadata | null;
    after?: AdminAuditLogMetadata | null;
  },
): Promise<void> {
  const { ip, userAgent } = await readRequestContext();
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase.from("admin_audit_log").insert({
    actor_user_id: actorUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    business_id: options?.businessId ?? null,
    before: options?.before ?? null,
    after: options?.after ?? null,
    ip,
    user_agent: userAgent,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "admin_audit_log_write_failed",
        actorUserId,
        action,
        targetType,
        targetId,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/** Best-effort IP/user-agent extraction for a Server Action call (no NextRequest available there, unlike a route handler -- matches lib/http/widget-cors.ts's extractIp() convention). */
async function readRequestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent");
  return { ip, userAgent };
}

/** Lists the most recent platform-admin audit entries, newest first, for the Audit Log page (Stop 5) and any per-tenant Activity tab (Stop 2). */
export async function listAdminAuditLog(options?: { businessId?: string; limit?: number }) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.businessId) {
    query = query.eq("business_id", options.businessId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(
      JSON.stringify({ event: "admin_audit_log_read_failed", timestamp: new Date().toISOString() }),
    );
    return [];
  }
  return data;
}
