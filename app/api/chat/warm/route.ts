import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage } from "@/lib/errors";
import { warmWidgetBusinessContext, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";

/**
 * Widget-open warm-up (2026-10-27 latency programme, Step 4). The loader
 * calls this once when the visitor opens the panel, so the serverless
 * function is already awake and the business's authorized context is in the
 * per-instance cache (lib/widget-auth.ts) by the time the first message
 * arrives. It does exactly one authorized read: no AI or embedding call, no
 * conversation, no message, and no `last_used_at` write. The only write is
 * the rate limiter's own counter.
 *
 * Same trust model as every public widget endpoint: widget key + the
 * request's Origin must pass resolveBusinessFromWidgetKey()'s full check, and
 * every failure is the same generic 401. Rate-limited per IP on its own
 * counter (identifier prefixed `warm:`, in the existing `restore_ip` scope --
 * a new scope would need a constraint migration), so warm-ups never consume
 * the chat budget.
 */
const RATE_LIMIT_WINDOW_SECONDS = 300;
const WARM_IP_LIMIT = 20;

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
});

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(jsonError("Invalid request.", 400));
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return withCors(jsonError("Invalid request.", 400));
  }

  const ipAllowed = await checkAndIncrementRateLimit(
    "restore_ip",
    `warm:${extractIp(request)}`,
    WARM_IP_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!ipAllowed) {
    return withCors(jsonError("Too many requests.", 429));
  }

  try {
    await warmWidgetBusinessContext(parsed.data.widgetKey, extractOrigin(request));
  } catch (error) {
    if (error instanceof WidgetAuthError) {
      return withCors(jsonError("Invalid request.", 401));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }

  return withCors(jsonSuccess({ warmed: true }));
}
