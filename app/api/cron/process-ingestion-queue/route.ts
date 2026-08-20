import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { processIngestionQueue } from "@/lib/ingestion-queue";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Daily Vercel Cron backstop for Phase 23's ingestion queue (vercel.json) --
 * the normal-latency path is the `after()` call right after a document is
 * enqueued (see app/(dashboard)/dashboard/knowledge/actions.ts); this
 * route only exists to sweep up anything that missed that (a crashed
 * function, a retry still in backoff) since Vercel's Hobby plan caps
 * cron at once a day.
 *
 * Vercel signs cron-triggered requests with `Authorization: Bearer
 * $CRON_SECRET` when that env var is set (Vercel's own documented
 * convention) -- checked here so this route can't be used by an
 * arbitrary caller to force repeated Gemini-calling ingestion runs.
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
    const result = await processIngestionQueue();
    return jsonSuccess(result);
  } catch (error) {
    return jsonError(logAndGetUserMessage(error), 500);
  }
}
