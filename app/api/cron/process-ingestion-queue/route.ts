import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { processWebhookDeliveries } from "@/lib/webhook-delivery";
import { refreshDueUrlKnowledgeSources } from "@/lib/url-ingestion";
import { runSlaEscalationSweep } from "@/lib/sla-routing";
import { sendDailyDigestEmails } from "@/lib/notifications";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * `refreshDueUrlKnowledgeSources()` fetches up to 5 URLs sequentially per
 * run and can now fall back to a real headless-browser render
 * (lib/browser-render.ts) for JS-rendered sites -- extended to match
 * `/api/chat`'s existing `maxDuration` so several slow renders in one sweep
 * don't risk the platform's default timeout.
 */
export const maxDuration = 60;

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
 * Vercel's Hobby plan caps cron jobs and each one to once a day. The
 * handoff/lead email digest (lib/notifications.ts, Phase 25b) has no
 * immediate trigger at all -- it's inherently a once-a-day summary, so
 * this route IS its primary trigger, not just a backstop.
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
    const [ingestion, webhooks, urlRefresh, slaRouting, notificationDigest] = await Promise.all([
      processIngestionQueue(),
      processWebhookDeliveries(),
      refreshDueUrlKnowledgeSources(),
      runSlaEscalationSweep(),
      sendDailyDigestEmails(),
    ]);
    return jsonSuccess({ ingestion, webhooks, urlRefresh, slaRouting, notificationDigest });
  } catch (error) {
    return jsonError(logAndGetUserMessage(error), 500);
  }
}
