import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { evaluateHealth, schedulerMaxAgeMinutes, type HealthReport } from "@/lib/health-rules";

/**
 * Runs the deep health checks (lib/health-rules.ts). Each query is bounded
 * and independent; a failing count read never turns into "database down"
 * unless the basic round trip itself failed. Never throws.
 */
export async function runDeepHealthCheck(now: Date = new Date()): Promise<HealthReport> {
  const supabase = createServiceSupabaseClient();

  const ping = await supabase.from("businesses").select("id", { count: "exact", head: true }).limit(1);
  const databaseOk = !ping.error;

  let lastSchedulerStartAt: Date | null = null;
  let deadLetters24h: number | null = null;
  let openBillingCancellations: number | null = null;

  if (databaseOk) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [latestRun, whatsappFailed, instagramFailed, webhooksFailed, cancellations] = await Promise.all([
      supabase
        .from("scheduled_job_runs")
        .select("last_started_at")
        .not("last_started_at", "is", null)
        .order("last_started_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ last_started_at: string }>(),
      supabase.from("whatsapp_outbound_messages").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since),
      supabase.from("instagram_outbound_messages").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since),
      supabase.from("webhook_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since),
      supabase.from("billing_cancellations").select("id", { count: "exact", head: true }).in("status", ["pending", "failed"]),
    ]);
    if (!latestRun.error && latestRun.data) lastSchedulerStartAt = new Date(latestRun.data.last_started_at);
    const failedCounts = [whatsappFailed, instagramFailed, webhooksFailed];
    deadLetters24h = failedCounts.every((result) => !result.error)
      ? failedCounts.reduce((sum, result) => sum + (result.count ?? 0), 0)
      : null;
    openBillingCancellations = cancellations.error ? null : (cancellations.count ?? 0);
  }

  return evaluateHealth({
    databaseOk,
    lastSchedulerStartAt,
    now,
    schedulerMaxAgeMinutes: schedulerMaxAgeMinutes(process.env.HEALTH_SCHEDULER_MAX_AGE_MINUTES),
    deadLetters24h,
    openBillingCancellations,
  });
}

export type SchedulerJobStatusRow = {
  jobName: string;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  running: boolean;
};

/** For /apache/jobs (the caller must already have passed requirePlatformAdmin). */
export async function listSchedulerJobStatus(): Promise<SchedulerJobStatusRow[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("scheduled_job_runs")
    .select("job_name, locked_until, last_started_at, last_succeeded_at, last_failed_at, last_error, last_duration_ms, consecutive_failures")
    .order("job_name", { ascending: true });
  if (error || !data) return [];
  const now = Date.now();
  return (
    data as {
      job_name: string;
      locked_until: string | null;
      last_started_at: string | null;
      last_succeeded_at: string | null;
      last_failed_at: string | null;
      last_error: string | null;
      last_duration_ms: number | null;
      consecutive_failures: number;
    }[]
  ).map((row) => ({
    jobName: row.job_name,
    lastStartedAt: row.last_started_at,
    lastSucceededAt: row.last_succeeded_at,
    lastFailedAt: row.last_failed_at,
    lastError: row.last_error,
    lastDurationMs: row.last_duration_ms,
    consecutiveFailures: row.consecutive_failures,
    running: row.locked_until !== null && new Date(row.locked_until).getTime() > now,
  }));
}

export type OpenBillingCancellationRow = {
  businessName: string;
  razorpaySubscriptionId: string;
  status: string;
  attempts: number;
  chargesAfterDeletion: number;
  lastError: string | null;
  createdAt: string;
};

/** Deleted businesses whose Razorpay subscription is not confirmed cancelled (for /apache/jobs). */
export async function listOpenBillingCancellations(): Promise<OpenBillingCancellationRow[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("billing_cancellations")
    .select("business_name, business_id, razorpay_subscription_id, status, attempts, charges_after_deletion, last_error, created_at")
    .or("status.in.(pending,failed),charges_after_deletion.gt.0")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (
    data as {
      business_name: string | null;
      business_id: string;
      razorpay_subscription_id: string;
      status: string;
      attempts: number;
      charges_after_deletion: number;
      last_error: string | null;
      created_at: string;
    }[]
  ).map((row) => ({
    businessName: row.business_name ?? row.business_id,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    status: row.status,
    attempts: row.attempts,
    chargesAfterDeletion: row.charges_after_deletion,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));
}
