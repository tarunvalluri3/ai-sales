import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  createConversation,
  flagConversationNeedsAttention,
  getConversationForBusiness,
} from "@/lib/conversations";
import { createMessage, listRecentMessages } from "@/lib/messages";
import { askSalesEmployee } from "@/lib/rag";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";

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

/**
 * Returned when a conversation is human-controlled (Phase 15a) instead of
 * calling askSalesEmployee(). A static, server-authored string, never
 * model output -- this is not persisted as a message row (see the
 * control check below), so it costs nothing to keep unchanged if a human
 * reply arrives moments later.
 */
const HUMAN_CONTROL_MESSAGE =
  "Thanks for your message — a member of our team has this conversation and will reply here shortly.";

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
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

    // Persisted unconditionally, regardless of control state, so a human
    // reviewing the conversation sees every prospect message even while
    // it's human-controlled and the AI is not being called.
    const userMessageRow = await createMessage(supabase, business.businessId, conversation.id, "user", message);

    // Phase 15a's AI-pause guard: once a human has taken over (a
    // deliberate dashboard action, never set by AI output -- see
    // lib/conversations.ts's setConversationControl()), askSalesEmployee()
    // must never be called for this conversation. Without this check, the
    // AI and a human could both reply to the same prospect message.
    if (conversation.control === "human") {
      // `asOf` is the widget-loader's initial polling cursor (Phase
      // 15b) -- everything up to and including this response is
      // already known to the client, so it's safe to poll for anything
      // strictly after it.
      return withCors(
        jsonSuccess({
          conversationId: conversation.id,
          answer: HUMAN_CONTROL_MESSAGE,
          escalate: false,
          control: conversation.control,
          asOf: userMessageRow.created_at,
        }),
      );
    }

    const history = await listRecentMessages(supabase, business.businessId, conversation.id, HISTORY_LIMIT);

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

    const assistantMessageRow = await createMessage(
      supabase,
      business.businessId,
      conversation.id,
      "assistant",
      response.answer,
    );

    if (response.escalate) {
      // Flags the conversation for dashboard attention -- deliberately
      // does not change `control`. See prompts/phase-15a-handoff-state-and-ai-pause.md's
      // "Decisions and assumptions" #1 for why escalation alone must not
      // silence the AI before a human is actually watching.
      await flagConversationNeedsAttention(supabase, business.businessId, conversation.id);
    }

    return withCors(
      jsonSuccess({
        conversationId: conversation.id,
        answer: response.answer,
        escalate: response.escalate,
        control: conversation.control,
        asOf: assistantMessageRow.created_at,
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
