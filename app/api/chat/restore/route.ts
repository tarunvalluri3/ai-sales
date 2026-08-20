import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getConversationForBusiness } from "@/lib/conversations";
import { listMessagesForConversation } from "@/lib/messages";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";

/**
 * Public, unauthenticated read endpoint (docs/security.md §4), mirroring
 * app/api/chat/route.ts's/poll/route.ts's own widget-key + origin
 * resolution exactly. Called once by public/widget-loader.js on page
 * load when it finds a conversationId already stored in the host page's
 * localStorage (Phase 25a "widget conversation restored from the
 * database on page refresh"), never polled. Returns the full transcript
 * -- including the prospect's own prior messages, unlike
 * /api/chat/poll's excludeRoles: ["user"] (the widget already knows its
 * own current-session messages from local state; here there is no
 * current-session state yet, this IS the state).
 */

const RATE_LIMIT_WINDOW_SECONDS = 300;
const RESTORE_IP_LIMIT = 60;

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
  conversationId: z.string().uuid(),
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

  const { widgetKey, conversationId } = parsed.data;
  const origin = extractOrigin(request);
  const ip = extractIp(request);

  const ipAllowed = await checkAndIncrementRateLimit(
    "restore_ip",
    ip,
    RESTORE_IP_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!ipAllowed) {
    return withCors(jsonError("Too many requests.", 429));
  }

  let business: { businessId: string };
  try {
    business = await resolveBusinessFromWidgetKey(widgetKey, origin);
  } catch (error) {
    if (error instanceof WidgetAuthError) {
      return withCors(jsonError("Invalid request.", 401));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }

  const supabase = createServiceSupabaseClient();

  try {
    const conversation = await getConversationForBusiness(supabase, business.businessId, conversationId);
    if (!conversation) {
      return withCors(jsonError("Invalid request.", 400));
    }

    const messages = await listMessagesForConversation(supabase, business.businessId, conversationId);
    const asOf = messages.length > 0 ? messages[messages.length - 1].created_at : new Date(0).toISOString();

    return withCors(
      jsonSuccess({
        conversationId,
        control: conversation.control,
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
        asOf,
      }),
    );
  } catch (error) {
    if (error instanceof AppError) {
      return withCors(jsonError(logAndGetUserMessage(error), 500));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }
}
