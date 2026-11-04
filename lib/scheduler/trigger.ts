import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";
import { isAuthorizedCronRequest, MIN_CRON_SECRET_LENGTH, parseJobFilter } from "@/lib/scheduler/auth";
import { runScheduledJobs } from "@/lib/scheduler/runner";
import { createSupabaseJobLockStore } from "@/lib/scheduler/store";
import { SCHEDULED_JOBS, SCHEDULED_JOB_NAMES } from "@/lib/scheduler/jobs";

/**
 * The one entry point every scheduler trigger goes through -- /api/cron/run
 * (VPS crontab, manual) and the legacy /api/cron/process-ingestion-queue
 * (Vercel's daily cron). Host-independent: plain HTTP + a bearer secret.
 * Returns 404 to anything unauthenticated, so the endpoint isn't advertised.
 */
export async function handleSchedulerTrigger(request: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    const secret = process.env.CRON_SECRET;
    if (secret !== undefined && secret.length < MIN_CRON_SECRET_LENGTH) {
      // Fails closed, but loudly: otherwise no background job would ever run.
      logEvent("cron_secret_too_short", "system", { minLength: MIN_CRON_SECRET_LENGTH }, "error");
    }
    return jsonError("Not found.", 404);
  }

  const { only, unknown } = parseJobFilter(request.nextUrl.searchParams.get("jobs"), SCHEDULED_JOB_NAMES);
  if (unknown.length > 0) {
    return jsonError(`Unknown job(s): ${unknown.join(", ")}`, 400);
  }

  try {
    const ownerId = `run_${randomUUID()}`;
    const startedAt = Date.now();
    const reports = await runScheduledJobs({
      jobs: SCHEDULED_JOBS,
      store: createSupabaseJobLockStore(),
      ownerId,
      only,
      onEvent: (event) => {
        // Successes are routine; only log them as info. Failures go to Sentry.
        logEvent(event.event, "system", { job: event.job, ...event.metadata }, event.level);
      },
    });
    const ran = reports.filter((report) => report.status === "succeeded" || report.status === "failed" || report.status === "timed_out");
    logEvent("scheduler_run", "system", {
      ownerId,
      durationMs: Date.now() - startedAt,
      ran: ran.length,
      failed: reports.filter((report) => report.status === "failed" || report.status === "timed_out").length,
      locked: reports.filter((report) => report.status === "locked").length,
    });
    return jsonSuccess({ ownerId, jobs: reports });
  } catch (error) {
    // runScheduledJobs never throws; this is only reached on a programming error.
    return jsonError(logAndGetUserMessage(error), 500);
  }
}
