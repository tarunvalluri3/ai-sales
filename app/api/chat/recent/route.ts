import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError } from "@/lib/widget-auth";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { listRecentConversationsForVisitor } from "@/lib/conversations";
import { getFirstUserMessage } from "@/lib/messages";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";

/**
 * Public, unauthenticated read endpoint (docs/security.md §4), mirroring
 * app/api/chat/restore/route.ts's widget-key + origin resolution
 * exactly. Called by public/widget-loader.js when the widget's "View
 * recent chats" menu item is used (Phase 25d). Unlike restore, this has
 * no conversationId to look up -- it lists conversations by
 * (business_id, visitor_id), so both must be present and correct;
 * business_id comes only from the resolved widget key, never the
 * client, and visitor_id is scoped alongside it on every query
 * (lib/conversations.ts's listRecentConversationsForVisitor()) so one
 * business's widget key can never surface a different visitor's chats.
 */

const RATE_LIMIT_WINDOW_SECONDS = 300;
const RECENT_CHATS_IP_LIMIT = 60;
const PREVIEW_MAX_LENGTH = 140;

const bodySchema = z.object({
  widgetKey: z.string().uuid(),
  visitorId: z.string().trim().min(1).max(100),
});

function truncatePreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_MAX_LENGTH ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH)}…` : trimmed;
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

  const { widgetKey, visitorId } = parsed.data;
  const origin = extractOrigin(request);
  const ip = extractIp(request);

  const ipAllowed = await checkAndIncrementRateLimit(
    "recent_chats_ip",
    ip,
    RECENT_CHATS_IP_LIMIT,
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
    const conversations = await listRecentConversationsForVisitor(supabase, business.businessId, visitorId);

    const withPreviews = await Promise.all(
      conversations.map(async (conversation) => {
        const firstMessage = await getFirstUserMessage(supabase, business.businessId, conversation.id);
        return {
          id: conversation.id,
          createdAt: conversation.createdAt,
          preview: firstMessage ? truncatePreview(firstMessage) : null,
        };
      }),
    );

    return withCors(jsonSuccess({ conversations: withPreviews }));
  } catch (error) {
    if (error instanceof AppError) {
      return withCors(jsonError(logAndGetUserMessage(error), 500));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }
}
