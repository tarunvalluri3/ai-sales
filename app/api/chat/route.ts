import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createConversation, getConversationForBusiness } from "@/lib/conversations";
import { createMessage, listRecentMessages } from "@/lib/messages";
import { askSalesEmployee } from "@/lib/rag";

/**
 * The one intentionally public, unauthenticated endpoint in this app
 * (docs/security.md §4). Never calls requireAuthContext()/auth.protect().
 * business_id is never accepted from the client -- it is resolved
 * server-side from widgetKey + the request's Origin/Referer header via
 * resolveBusinessFromWidgetKey().
 */

const RATE_LIMIT_WINDOW_SECONDS = 300;
const IP_LIMIT = 30;
const KEY_LIMIT = 120;
const CONVERSATION_LIMIT = 20;
const HISTORY_LIMIT = 20;
const MESSAGE_MAX_LENGTH = 2000;

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function extractOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function extractIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}

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

  const { widgetKey, conversationId, message } = parsed.data;
  const origin = extractOrigin(request);
  const ip = extractIp(request);

  const ipAllowed = await checkAndIncrementRateLimit("ip", ip, IP_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
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

  const keyAllowed = await checkAndIncrementRateLimit("key", widgetKey, KEY_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (!keyAllowed) {
    return withCors(jsonError("Too many requests.", 429));
  }

  const supabase = createServiceSupabaseClient();

  try {
    let conversation = conversationId
      ? await getConversationForBusiness(supabase, business.businessId, conversationId)
      : null;

    if (conversationId && !conversation) {
      return withCors(jsonError("Invalid request.", 400));
    }

    if (!conversation) {
      conversation = await createConversation(supabase, business.businessId, "chat_widget");
    }

    const conversationAllowed = await checkAndIncrementRateLimit(
      "conversation",
      conversation.id,
      CONVERSATION_LIMIT,
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!conversationAllowed) {
      return withCors(jsonError("Too many requests.", 429));
    }

    const history = await listRecentMessages(supabase, business.businessId, conversation.id, HISTORY_LIMIT);

    await createMessage(supabase, business.businessId, conversation.id, "user", message);

    let response;
    try {
      response = await askSalesEmployee(
        supabase,
        business.businessId,
        conversation.id,
        business.businessName,
        message,
        history,
      );
    } catch (error) {
      const userMessage = logAndGetUserMessage(error);
      return withCors(jsonError(userMessage, 500));
    }

    await createMessage(supabase, business.businessId, conversation.id, "assistant", response.answer);

    return withCors(
      jsonSuccess({
        conversationId: conversation.id,
        answer: response.answer,
        escalate: response.escalate,
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
