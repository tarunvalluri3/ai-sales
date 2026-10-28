"use server";

import { z } from "zod";
import { requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import type { ActionResult } from "@/lib/admin-tenant-actions";
import type { QueueName } from "@/lib/admin-jobs";

/** Phase 33 Stop 4 (docs/phases.md): retries one failed job row by resetting it back into its queue's "ready to try again" state -- the existing sweep (app/api/cron/process-ingestion-queue/route.ts) picks it up on its next run, same as a normal retry. Does not re-attempt delivery itself (no synchronous send here). */

const queueSchema = z.enum(["webhook_deliveries", "whatsapp_outbound_messages", "instagram_outbound_messages", "workflow_runs"]);

/** Each queue's "ready to try again right now" status and the column its sweep reads to decide timing. */
const RETRY_RESET: Record<QueueName, { status: string; timingColumn: "next_attempt_at" | "resume_at" }> = {
  webhook_deliveries: { status: "pending", timingColumn: "next_attempt_at" },
  whatsapp_outbound_messages: { status: "pending", timingColumn: "next_attempt_at" },
  instagram_outbound_messages: { status: "pending", timingColumn: "next_attempt_at" },
  workflow_runs: { status: "queued", timingColumn: "resume_at" },
};

export async function retryFailedJob(queue: QueueName, id: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const queueCheck = queueSchema.safeParse(queue);
  if (!queueCheck.success) return { ok: false, error: "Unknown queue." };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  const reset = RETRY_RESET[queue];
  const update = { status: reset.status, [reset.timingColumn]: new Date().toISOString() };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from(queue).select("status").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "Job not found." };

  const { error } = await supabase.from(queue).update(update).eq("id", id);
  if (error) return { ok: false, error: "Could not retry this job. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "job.retried", queue, id, { before: { status: before.status }, after: { status: "retrying" } });
  return { ok: true };
}
