/**
 * Deep health evaluation (production readiness, item 9; LAUNCH_AUDIT.md §1
 * "the health check is liveness only"). Pure, no server-only import.
 *
 * `GET /api/health` stays a cheap liveness probe. `GET /api/health?deep=1`
 * checks what actually breaks the product silently:
 *  - database: a real query round trip;
 *  - scheduler: the most recent job start is recent (a stopped VPS cron
 *    otherwise goes unnoticed until customers complain);
 *  - dead letters and open billing cancellations: reported (with the cron
 *    secret) but they only degrade, never fail, the check.
 * An uptime monitor watching `?deep=1` gets 503 when the database is down or
 * the scheduler has stopped.
 */

export type HealthCheckState = "ok" | "down" | "stale" | "unknown";

export type HealthInputs = {
  databaseOk: boolean;
  lastSchedulerStartAt: Date | null;
  now: Date;
  schedulerMaxAgeMinutes: number;
  deadLetters24h: number | null;
  openBillingCancellations: number | null;
};

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  httpStatus: 200 | 503;
  checks: { database: HealthCheckState; scheduler: HealthCheckState };
  details: { deadLetters24h: number | null; openBillingCancellations: number | null; schedulerLastStartMinutesAgo: number | null };
};

/** Default: the VPS cron runs every 1-2 minutes, so 15 minutes of silence means it stopped. */
export const DEFAULT_SCHEDULER_MAX_AGE_MINUTES = 15;

export function schedulerMaxAgeMinutes(raw: string | undefined): number {
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCHEDULER_MAX_AGE_MINUTES;
}

export function evaluateHealth(input: HealthInputs): HealthReport {
  const minutesAgo =
    input.lastSchedulerStartAt === null ? null : Math.floor((input.now.getTime() - input.lastSchedulerStartAt.getTime()) / 60_000);
  const scheduler: HealthCheckState = !input.databaseOk
    ? "unknown"
    : minutesAgo === null
      ? "unknown"
      : minutesAgo > input.schedulerMaxAgeMinutes
        ? "stale"
        : "ok";
  const database: HealthCheckState = input.databaseOk ? "ok" : "down";

  const failing = database === "down" || scheduler === "stale";
  const degraded =
    scheduler === "unknown" || (input.deadLetters24h ?? 0) > 0 || (input.openBillingCancellations ?? 0) > 0;

  return {
    status: failing ? "down" : degraded ? "degraded" : "ok",
    httpStatus: failing ? 503 : 200,
    checks: { database, scheduler },
    details: {
      deadLetters24h: input.deadLetters24h,
      openBillingCancellations: input.openBillingCancellations,
      schedulerLastStartMinutesAgo: minutesAgo,
    },
  };
}
