/**
 * When a scheduled job is due (production readiness, item 3). Pure, no
 * server-only import: the unit tests import it directly.
 *
 * The trigger (a VPS crontab, Vercel Cron, a manual call) can fire as often as
 * it likes -- every minute, every five -- and each job still runs only as
 * often as its own schedule allows. Daily jobs (the digest email, stalled-lead
 * follow-ups, the analytics rollup) therefore run once a day however often
 * the trigger fires, at the same 04:00 UTC slot the old Vercel cron used.
 */

export type JobSchedule =
  /** At most once every `seconds` (measured from the last start). */
  | { kind: "every"; seconds: number }
  /**
   * Once per UTC day, at or after `utcHour:utcMinute`. A missed day is caught
   * up once. By default AT MOST once per day: a run that started counts, even
   * if it failed or timed out, so a non-idempotent job (the digest email) can
   * never send twice. `retryFailedSameDay: true` -- only for idempotent jobs --
   * retries on later triggers until one succeeds.
   */
  | { kind: "daily"; utcHour: number; utcMinute?: number; retryFailedSameDay?: boolean };

/**
 * Slack for trigger jitter: a job "every 60 s" triggered by a 1-minute
 * crontab must not skip every other tick because the previous run started at
 * :00.4 and this one at :00.1.
 */
export const SCHEDULE_JITTER_SECONDS = 15;

export type JobTimestamps = {
  lastStartedAt: Date | null;
  lastSucceededAt: Date | null;
};

/** The most recent daily slot at or before `now`. */
export function latestDailySlot(now: Date, utcHour: number, utcMinute = 0): Date {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, utcMinute, 0, 0));
  if (slot.getTime() > now.getTime()) slot.setUTCDate(slot.getUTCDate() - 1);
  return slot;
}

export function isJobDue(schedule: JobSchedule, timestamps: JobTimestamps, now: Date): boolean {
  if (schedule.kind === "every") {
    if (!timestamps.lastStartedAt) return true;
    const elapsedSeconds = (now.getTime() - timestamps.lastStartedAt.getTime()) / 1000;
    return elapsedSeconds >= schedule.seconds - SCHEDULE_JITTER_SECONDS;
  }
  const slot = latestDailySlot(now, schedule.utcHour, schedule.utcMinute ?? 0);
  // Idempotent daily jobs: due until the latest slot has a SUCCESSFUL run.
  // Everything else: due until the latest slot has had any run at all.
  const reference = schedule.retryFailedSameDay ? timestamps.lastSucceededAt : timestamps.lastStartedAt;
  return !reference || reference.getTime() < slot.getTime();
}

/** Consecutive failures at which a job raises its "failing repeatedly" alert. */
export const REPEATED_FAILURE_ALERT_THRESHOLD = 3;

export function shouldAlertRepeatedFailure(consecutiveFailures: number): boolean {
  return consecutiveFailures >= REPEATED_FAILURE_ALERT_THRESHOLD;
}
