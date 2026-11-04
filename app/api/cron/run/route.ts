import type { NextRequest } from "next/server";
import { handleSchedulerTrigger } from "@/lib/scheduler/trigger";

/**
 * The scheduler trigger (production readiness, item 3). Call it every 1-2
 * minutes from any host -- a VPS crontab or systemd timer (docs/vps-cron.md),
 * an uptime pinger, a manual curl:
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/run
 *
 * Optional `?jobs=whatsapp_outbound,instagram_outbound` runs only those jobs.
 * Each job runs only when its own schedule says it is due and only if no
 * other run holds its lease (lib/scheduler/runner.ts), so calling this more
 * often, or from two places at once, is safe. 404 without the secret.
 *
 * Not in vercel.json: Vercel Hobby rejects sub-daily crons at deploy time.
 * The existing daily Vercel cron (/api/cron/process-ingestion-queue) calls
 * the same runner.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleSchedulerTrigger(request);
}

export async function GET(request: NextRequest) {
  return handleSchedulerTrigger(request);
}
