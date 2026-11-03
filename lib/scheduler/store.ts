import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { JobLockStore, JobState } from "@/lib/scheduler/runner";

/**
 * The database-backed lease store for lib/scheduler/runner.ts
 * (public.scheduled_job_runs, migration 20261116000000). Service role only.
 */
export function createSupabaseJobLockStore(
  supabase: ReturnType<typeof createServiceSupabaseClient> = createServiceSupabaseClient(),
): JobLockStore {
  return {
    async readStates(jobNames) {
      const { data, error } = await supabase
        .from("scheduled_job_runs")
        .select("job_name, last_started_at, last_succeeded_at, consecutive_failures")
        .in("job_name", jobNames);
      if (error) throw new Error(`scheduled_job_runs read failed (${error.code ?? "unknown"})`);
      const states = new Map<string, JobState>();
      for (const row of (data ?? []) as {
        job_name: string;
        last_started_at: string | null;
        last_succeeded_at: string | null;
        consecutive_failures: number;
      }[]) {
        states.set(row.job_name, {
          lastStartedAt: row.last_started_at ? new Date(row.last_started_at) : null,
          lastSucceededAt: row.last_succeeded_at ? new Date(row.last_succeeded_at) : null,
          consecutiveFailures: row.consecutive_failures,
        });
      }
      return states;
    },

    async acquire(jobName, ownerId, ttlSeconds) {
      const { data, error } = await supabase.rpc("try_acquire_scheduled_job", {
        p_job: jobName,
        p_owner: ownerId,
        p_ttl_seconds: ttlSeconds,
      });
      if (error) throw new Error(`try_acquire_scheduled_job failed (${error.code ?? "unknown"})`);
      return data === true;
    },

    async release(jobName, ownerId, outcome) {
      const { data, error } = await supabase.rpc("release_scheduled_job", {
        p_job: jobName,
        p_owner: ownerId,
        p_succeeded: outcome.succeeded,
        p_error: outcome.error,
        p_duration_ms: outcome.durationMs,
        p_result: toJsonResult(outcome.result),
      });
      if (error) throw new Error(`release_scheduled_job failed (${error.code ?? "unknown"})`);
      return typeof data === "number" ? data : -1;
    },
  };
}

/** Job results are small count objects; anything else is dropped rather than stored. */
function toJsonResult(result: unknown): unknown {
  if (result === undefined) return null;
  try {
    const json = JSON.stringify(result);
    return json.length <= 4_000 ? JSON.parse(json) : { truncated: true };
  } catch {
    return null;
  }
}
