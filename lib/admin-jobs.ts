import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Phase 33 Stop 4 (docs/phases.md): /apache Jobs & System Health reads.
 * Covers the real background queues this app already has -- no new queue
 * table. `knowledge_documents.ingestion_status` is read-only here
 * (tenants already have their own retry action on the Knowledge page,
 * per STATE.md); the other four are genuinely admin-only operational
 * queues with no tenant-facing retry UI, so Stop 4 adds one.
 */

export type QueueName = "webhook_deliveries" | "whatsapp_outbound_messages" | "instagram_outbound_messages" | "workflow_runs";

export type QueueStatusCounts = Record<string, number>;

export type JobsOverview = {
  knowledgeIngestion: QueueStatusCounts;
  webhookDeliveries: QueueStatusCounts;
  whatsappOutbound: QueueStatusCounts;
  instagramOutbound: QueueStatusCounts;
  workflowRuns: QueueStatusCounts;
};

async function countByStatus(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  statusColumn: string,
  statuses: string[],
): Promise<QueueStatusCounts> {
  const counts: QueueStatusCounts = {};
  await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(statusColumn, status);
      counts[status] = count ?? 0;
    }),
  );
  return counts;
}

export async function getJobsOverview(): Promise<JobsOverview> {
  const supabase = createAdminSupabaseClient();

  const [knowledgeIngestion, webhookDeliveries, whatsappOutbound, instagramOutbound, workflowRuns] = await Promise.all([
    countByStatus(supabase, "knowledge_documents", "ingestion_status", ["pending", "processing", "complete", "failed"]),
    countByStatus(supabase, "webhook_deliveries", "status", ["pending", "processing", "complete", "failed"]),
    countByStatus(supabase, "whatsapp_outbound_messages", "status", ["pending", "processing", "sent", "failed"]),
    countByStatus(supabase, "instagram_outbound_messages", "status", ["pending", "processing", "sent", "failed"]),
    countByStatus(supabase, "workflow_runs", "status", ["queued", "running", "completed", "failed", "skipped", "cancelled"]),
  ]);

  return { knowledgeIngestion, webhookDeliveries, whatsappOutbound, instagramOutbound, workflowRuns };
}

export type FailedJobRow = {
  id: string;
  businessId: string;
  businessName: string;
  queue: QueueName;
  summary: string;
  lastError: string | null;
  attempts: number;
  updatedAt: string | null;
};

const FAILED_JOB_LIMIT = 50;

export async function listRecentFailures(): Promise<FailedJobRow[]> {
  const supabase = createAdminSupabaseClient();
  const { data: businesses } = await supabase.from("businesses").select("id, name");
  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const [webhooks, whatsapp, instagram, workflows] = await Promise.all([
    supabase
      .from("webhook_deliveries")
      .select("id, business_id, event_type, last_error, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(FAILED_JOB_LIMIT),
    supabase
      .from("whatsapp_outbound_messages")
      .select("id, business_id, last_error, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(FAILED_JOB_LIMIT),
    supabase
      .from("instagram_outbound_messages")
      .select("id, business_id, last_error, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(FAILED_JOB_LIMIT),
    supabase
      .from("workflow_runs")
      .select("id, business_id, trigger_event, failure_reason, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(FAILED_JOB_LIMIT),
  ]);

  const rows: FailedJobRow[] = [
    ...(webhooks.data ?? []).map((r) => ({
      id: r.id,
      businessId: r.business_id,
      businessName: businessNameById.get(r.business_id) ?? "Unknown",
      queue: "webhook_deliveries" as const,
      summary: `Webhook: ${r.event_type}`,
      lastError: r.last_error,
      attempts: r.attempts,
      updatedAt: r.updated_at,
    })),
    ...(whatsapp.data ?? []).map((r) => ({
      id: r.id,
      businessId: r.business_id,
      businessName: businessNameById.get(r.business_id) ?? "Unknown",
      queue: "whatsapp_outbound_messages" as const,
      summary: "WhatsApp message",
      lastError: r.last_error,
      attempts: r.attempts,
      updatedAt: r.updated_at,
    })),
    ...(instagram.data ?? []).map((r) => ({
      id: r.id,
      businessId: r.business_id,
      businessName: businessNameById.get(r.business_id) ?? "Unknown",
      queue: "instagram_outbound_messages" as const,
      summary: "Instagram message",
      lastError: r.last_error,
      attempts: r.attempts,
      updatedAt: r.updated_at,
    })),
    ...(workflows.data ?? []).map((r) => ({
      id: r.id,
      businessId: r.business_id,
      businessName: businessNameById.get(r.business_id) ?? "Unknown",
      queue: "workflow_runs" as const,
      summary: `Workflow: ${r.trigger_event}`,
      lastError: r.failure_reason,
      attempts: r.attempts,
      updatedAt: r.updated_at,
    })),
  ];

  return rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export type SystemHealthChecks = {
  databaseOk: boolean;
  geminiLastSuccessAgoMinutes: number | null;
  whatsappAnyConnected: boolean;
  instagramAnyConnected: boolean;
};

/**
 * Not a live ping of Gemini/Meta -- this app has no safe way to make a
 * real-time health-check call to either without spending a real API call
 * or risking a false "down" from a single slow request. Instead: "has a
 * real call succeeded recently" (Gemini) and "does any tenant currently
 * have a connected integration" (WhatsApp/Instagram) -- honest proxies,
 * not fabricated uptime percentages.
 */
export async function getSystemHealthChecks(): Promise<SystemHealthChecks> {
  const supabase = createAdminSupabaseClient();

  const [dbCheck, lastGeminiSuccess, whatsappConnected, instagramConnected] = await Promise.all([
    supabase.from("businesses").select("id", { count: "exact", head: true }).limit(1),
    supabase
      .from("gemini_api_calls")
      .select("created_at")
      .eq("success", true)
      .eq("environment", "production")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("whatsapp_connections").select("id", { count: "exact", head: true }).eq("status", "connected"),
    supabase.from("instagram_connections").select("id", { count: "exact", head: true }).eq("status", "connected"),
  ]);

  const geminiLastSuccessAgoMinutes = lastGeminiSuccess.data
    ? Math.round((Date.now() - new Date(lastGeminiSuccess.data.created_at).getTime()) / 60000)
    : null;

  return {
    databaseOk: !dbCheck.error,
    geminiLastSuccessAgoMinutes,
    whatsappAnyConnected: (whatsappConnected.count ?? 0) > 0,
    instagramAnyConnected: (instagramConnected.count ?? 0) > 0,
  };
}
