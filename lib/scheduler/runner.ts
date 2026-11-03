/**
 * Runs the scheduled jobs that are due (production readiness, item 3;
 * LAUNCH_AUDIT.md §2 / blocker B3). Pure orchestration with injected
 * dependencies -- the job functions, the lock store, the clock, the event
 * sink -- so it is unit-tested with fakes and has no server-only import.
 *
 * Guarantees, whoever triggers it and however often:
 *  - Idempotent scheduling: a job runs only when its schedule says it is due
 *    (lib/scheduler/schedule.ts), so a 1-minute crontab never runs a daily job
 *    more than once a day.
 *  - No overlap: each job takes a lease in the database first
 *    (try_acquire_scheduled_job). An overlapping trigger, or a second server,
 *    skips a job that is already running. The lease expires by itself, so a
 *    killed run never blocks a job for good.
 *  - Isolation: jobs run concurrently and independently; one failing or
 *    timing out never stops the others (the old route ran 13 sweeps in one
 *    Promise.all, so one bad sweep sank the whole day's run).
 *  - Retries: a failed job is retried (job.retries, default 1) within the run;
 *    a timeout is not retried in-run (the timed-out work may still be going),
 *    the next trigger picks it up once the lease expires.
 *  - Failure handling: every failure is an error-level event (Sentry), and
 *    REPEATED_FAILURE_ALERT_THRESHOLD consecutive failures raise a separate
 *    `scheduler_job_failing` alert. Never throws.
 */
import { isJobDue, shouldAlertRepeatedFailure, type JobSchedule, type JobTimestamps } from "@/lib/scheduler/schedule";

export type ScheduledJob = {
  name: string;
  schedule: JobSchedule;
  run: () => Promise<unknown>;
  /** Hard ceiling for one attempt. */
  timeoutMs: number;
  /** In-run retries after a failure (not after a timeout). Default 1. */
  retries?: number;
};

export type JobState = JobTimestamps & { consecutiveFailures: number };

export interface JobLockStore {
  readStates(jobNames: string[]): Promise<Map<string, JobState>>;
  /** True only for the caller that took the lease. */
  acquire(jobName: string, ownerId: string, ttlSeconds: number): Promise<boolean>;
  /** Records the outcome and frees the lease. Returns the new consecutive-failure count (-1 if the lease was lost). */
  release(
    jobName: string,
    ownerId: string,
    outcome: { succeeded: boolean; error: string | null; durationMs: number; result: unknown },
  ): Promise<number>;
}

export type SchedulerEvent = {
  event:
    | "scheduler_job_succeeded"
    | "scheduler_job_failed"
    | "scheduler_job_failing"
    | "scheduler_job_lock_lost"
    | "scheduler_state_read_failed";
  level: "info" | "error";
  job: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type JobRunStatus = "succeeded" | "failed" | "timed_out" | "not_due" | "locked" | "skipped";

export type JobRunReport = {
  job: string;
  status: JobRunStatus;
  attempts: number;
  durationMs: number;
  error?: string;
  result?: unknown;
};

export class JobTimeoutError extends Error {
  constructor(job: string, timeoutMs: number) {
    super(`${job} timed out after ${timeoutMs} ms`);
    this.name = "JobTimeoutError";
  }
}

/** Rejects with JobTimeoutError if `run` hasn't settled within `timeoutMs`. */
export function runWithTimeout<T>(job: string, run: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new JobTimeoutError(job, timeoutMs)), timeoutMs);
    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

/** Lease length: the attempt ceiling for every try, plus a margin. */
export function leaseSeconds(job: ScheduledJob): number {
  const attempts = 1 + Math.max(0, job.retries ?? 1);
  return Math.ceil((job.timeoutMs * attempts) / 1000) + 60;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, 300);
}

export type RunSchedulerOptions = {
  jobs: ScheduledJob[];
  store: JobLockStore;
  ownerId: string;
  now?: () => Date;
  /** Restrict this run to these job names (e.g. a VPS cron that splits fast and slow jobs). */
  only?: string[];
  onEvent?: (event: SchedulerEvent) => void;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
};

export async function runScheduledJobs(options: RunSchedulerOptions): Promise<JobRunReport[]> {
  const now = options.now ?? (() => new Date());
  const emit = options.onEvent ?? (() => undefined);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  const selected = options.only && options.only.length > 0 ? new Set(options.only) : null;

  let states = new Map<string, JobState>();
  let stateReadFailed = false;
  try {
    states = await options.store.readStates(options.jobs.map((job) => job.name));
  } catch (error) {
    // Without state we can't tell what's due; acquiring still prevents
    // overlap, so only "every" jobs run (daily ones wait for the next trigger,
    // so a read outage can never send a second daily digest).
    stateReadFailed = true;
    emit({ event: "scheduler_state_read_failed", level: "error", job: "*", metadata: { error: errorText(error) } });
  }

  return Promise.all(
    options.jobs.map(async (job): Promise<JobRunReport> => {
      if (selected && !selected.has(job.name)) return { job: job.name, status: "skipped", attempts: 0, durationMs: 0 };

      const state = states.get(job.name);
      const timestamps: JobTimestamps = state ?? { lastStartedAt: null, lastSucceededAt: null };
      if (stateReadFailed && job.schedule.kind === "daily") {
        return { job: job.name, status: "not_due", attempts: 0, durationMs: 0 };
      }
      if (!isJobDue(job.schedule, timestamps, now())) {
        return { job: job.name, status: "not_due", attempts: 0, durationMs: 0 };
      }

      let acquired = false;
      try {
        acquired = await options.store.acquire(job.name, options.ownerId, leaseSeconds(job));
      } catch (error) {
        emit({ event: "scheduler_job_failed", level: "error", job: job.name, metadata: { stage: "acquire", error: errorText(error) } });
        return { job: job.name, status: "failed", attempts: 0, durationMs: 0, error: errorText(error) };
      }
      if (!acquired) return { job: job.name, status: "locked", attempts: 0, durationMs: 0 };

      return runOneJob(job, options, emit, sleep, retryDelayMs);
    }),
  );
}

async function runOneJob(
  job: ScheduledJob,
  options: RunSchedulerOptions,
  emit: (event: SchedulerEvent) => void,
  sleep: (ms: number) => Promise<void>,
  retryDelayMs: number,
): Promise<JobRunReport> {
  const maxAttempts = 1 + Math.max(0, job.retries ?? 1);
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown = null;
  let result: unknown;
  let succeeded = false;
  let timedOut = false;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      result = await runWithTimeout(job.name, job.run, job.timeoutMs);
      succeeded = true;
      break;
    } catch (error) {
      lastError = error;
      if (error instanceof JobTimeoutError) {
        timedOut = true;
        break;
      }
      if (attempts < maxAttempts) await sleep(retryDelayMs);
    }
  }

  const durationMs = Date.now() - startedAt;
  const error = succeeded ? null : errorText(lastError);

  let consecutiveFailures = -1;
  try {
    consecutiveFailures = await options.store.release(job.name, options.ownerId, { succeeded, error, durationMs, result: succeeded ? result : null });
  } catch (releaseError) {
    emit({ event: "scheduler_job_failed", level: "error", job: job.name, metadata: { stage: "release", error: errorText(releaseError) } });
  }
  if (consecutiveFailures === -1) {
    emit({ event: "scheduler_job_lock_lost", level: "error", job: job.name, metadata: { durationMs } });
  }

  if (succeeded) {
    emit({ event: "scheduler_job_succeeded", level: "info", job: job.name, metadata: { durationMs, attempts } });
    return { job: job.name, status: "succeeded", attempts, durationMs, result };
  }

  emit({
    event: "scheduler_job_failed",
    level: "error",
    job: job.name,
    metadata: { durationMs, attempts, timedOut, error, consecutiveFailures },
  });
  if (shouldAlertRepeatedFailure(consecutiveFailures)) {
    emit({ event: "scheduler_job_failing", level: "error", job: job.name, metadata: { consecutiveFailures, error } });
  }
  return { job: job.name, status: timedOut ? "timed_out" : "failed", attempts, durationMs, error: error ?? undefined };
}
