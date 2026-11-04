import { z } from "zod";

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/**
 * The public /api/chat request body (app/api/chat/route.ts). Lives here, not
 * in the route file, so the unit tests can import it under plain Node.
 */
export const chatRequestBodySchema = z.object({
  widgetKey: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  // The widget's opt-in checkbox ("contact details I share may be stored").
  // Optional and never a precondition for chatting: false/absent only means
  // request_callback / book_appointment refuse with `consent_required`, and
  // the model asks the visitor to tick the box (Phase 22c).
  consentGiven: z.boolean().optional(),
  pageUrl: z.string().max(2048).optional(),
  // Phase 25d "recent chats": a client-generated, unauthenticated
  // correlation id (public/widget-loader.js localStorage), stamped onto
  // a newly created conversation so app/api/chat/recent/route.ts can
  // later list this visitor's own past conversations. Never an identity
  // or authorization signal -- see lib/conversations.ts's
  // listRecentConversationsForVisitor() doc comment.
  visitorId: z.string().trim().min(1).max(100).optional(),
  // feat/chat-streaming: an explicit opt-in to the streamed (SSE) response,
  // alongside the `Accept: text/event-stream` header the widget-loader also
  // sends. Absent (every currently-live loader) means the byte-identical
  // buffered JSON response, so this changes nothing for an old embed.
  stream: z.boolean().optional(),
  // Phase 32 Stage E: ms between the widget loader starting and this send.
  // Client-supplied, so it can only ever TIGHTEN a limit (see
  // lib/abuse-limits.ts classifyClientSignal); absent from older embeds.
  clientElapsedMs: z.number().int().min(0).max(86_400_000).optional(),
  // Instant answers: the widget sets this when the message came from a
  // suggested-question chip. Client-supplied, so it is analytics only -- the
  // server decides what to serve from the message text itself, never from this.
  suggested: z.boolean().optional(),
  // Production readiness item 3: a Cloudflare Turnstile token from the widget
  // iframe, verified server-side only when a new conversation starts
  // (lib/chat-protection.ts). Absent from older embeds and when Turnstile is off.
  turnstileToken: z.string().min(1).max(2048).optional(),
});
