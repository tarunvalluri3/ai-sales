import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";
import { refreshDueUrlKnowledgeSources } from "@/lib/url-ingestion";
import { runSlaEscalationSweep } from "@/lib/sla-routing";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Daily Vercel Cron backstop, shared across every background queue this
 * app has (vercel.json) -- the normal-latency path for each is its own
 * `after()` call right after the triggering write (knowledge ingestion:
 * app/(dashboard)/dashboard/knowledge/actions.ts; webhook delivery:
 * lib/tools/request-callback.ts; URL source refresh has no immediate
 * trigger, since it's inherently a scheduled/periodic thing, not
 * request-triggered). This route only exists to sweep up anything an
 * immediate trigger missed (a crashed function, a retry still in
 * backoff) -- one shared daily route, not one cron job per queue, since
 * Vercel's Hobby plan caps cron jobs and each one to once a day.
 *
 * Vercel signs cron-triggered requests with `Authorization: Bearer
 * $CRON_SECRET` when that env var is set (Vercel's own documented
 * convention) -- checked here so this route can't be used by an
 * arbitrary caller to force repeated Gemini-calling/webhook-firing runs.
 * Fails closed: no CRON_SECRET configured means no request is ever
 * accepted, not an open endpoint.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return jsonError("Not found.", 404);
  }

  try {
    const [ingestion, webhooks, urlRefresh, slaRouting] = await Promise.all([
      processIngestionQueue(),
      processWebhookDeliveries(),
      refreshDueUrlKnowledgeSources(),
      runSlaEscalationSweep(),
    ]);
    return jsonSuccess({ ingestion, webhooks, urlRefresh, slaRouting });
  } catch (error) {
    return jsonError(logAndGetUserMessage(error), 500);
  }
}
