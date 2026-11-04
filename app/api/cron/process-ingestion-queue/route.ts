import type { NextRequest } from "next/server";
import { handleSchedulerTrigger } from "@/lib/scheduler/trigger";

/**
 * Legacy path kept because vercel.json's daily cron (`0 4 * * *`, the only
 * schedule Vercel Hobby accepts) calls it with `Authorization: Bearer
 * $CRON_SECRET`. Production readiness (item 3): it now runs the same
 * scheduler as /api/cron/run (lib/scheduler/), instead of 13 sweeps in one
 * Promise.all -- each job isolated, locked, timed out and retried on its own.
 * The once-a-day jobs keep their 04:00 UTC slot, so a Vercel-only deployment
 * behaves as before; a VPS crontab calling /api/cron/run every few minutes
 * adds the frequent queue/retry/SLA/appointment runs (docs/vps-cron.md).
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleSchedulerTrigger(request);
}
