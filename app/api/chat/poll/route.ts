import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getConversationForBusiness } from "@/lib/conversations";
import { listMessagesForConversationAfter } from "@/lib/messages";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";

/**
 * Public, unauthenticated read endpoint (docs/security.md §4), mirroring
 * app/api/chat/route.ts's own tenant/origin resolution exactly -- the
 * widget-key-resolution security model is reused unchanged, not a new
 * auth mechanism (Phase 15b's own explicit requirement). Polled by
 * public/widget-loader.js, never by the iframe directly, for the same
 * genuine-Origin-header reason /api/chat's fetch already lives there.
 *
 * Sized for recurring poll traffic, not message-send traffic -- see the
 * separate poll_ip/poll_conversation rate-limit scopes, distinct from
 * /api/chat's ip/key/conversation scopes (prompts/phase-15b-staff-reply-and-live-polling.md's
 * Decision 6).
 */

const RATE_LIMIT_WINDOW_SECONDS = 300;
const POLL_IP_LIMIT = 300;
const POLL_CONVERSATION_LIMIT = 100;
const POLL_RESULT_LIMIT = 50;

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
  conversationId: z.string().uuid(),
  after: z.iso.datetime({ offset: true }),
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

  const { widgetKey, conversationId, after } = parsed.data;
  const origin = extractOrigin(request);
  const ip = extractIp(request);

  const ipAllowed = await checkAndIncrementRateLimit("poll_ip", ip, POLL_IP_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (!ipAllowed) {
    return withCors(jsonError("Too many requests.", 429));
  }

  let business: { businessId: string; businessName: string };
  try {
    business = await resolveBusinessFromWidgetKey(widgetKey, origin);
  } catch (error) {
    if (error instanceof WidgetAuthError) {
      return withCors(jsonError("Invalid request.", 401));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }

  const conversationAllowed = await checkAndIncrementRateLimit(
    "poll_conversation",
    conversationId,
    POLL_CONVERSATION_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!conversationAllowed) {
    return withCors(jsonError("Too many requests.", 429));
  }

  const supabase = createServiceSupabaseClient();

  try {
    const conversation = await getConversationForBusiness(supabase, business.businessId, conversationId);
    if (!conversation) {
      return withCors(jsonError("Invalid request.", 400));
    }

    const messages = await listMessagesForConversationAfter(supabase, business.businessId, conversationId, after, {
      excludeRoles: ["user"],
      limit: POLL_RESULT_LIMIT,
    });

    const asOf = messages.length > 0 ? messages[messages.length - 1].created_at : after;

    return withCors(
      jsonSuccess({
        conversationId,
        control: conversation.control,
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
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
