import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { loadBusinessAiContext } from "@/lib/business-ai-context";
import {
  getOrCreateWhatsappConversation,
  resolveBusinessFromWhatsappPhoneNumberId,
} from "@/lib/whatsapp";
import { createWhatsappOutboundMessage, sendWhatsappOutboundMessage } from "@/lib/whatsapp-delivery";
import {
  flagConversationNeedsAttention,
  recordConversationConsent,
} from "@/lib/conversations";
import { createMessage, listRecentMessages } from "@/lib/messages";
import { askSalesEmployee } from "@/lib/rag";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";

/**
 * Phase 16's inbound WhatsApp receiver -- the WhatsApp analog of
 * app/api/chat/route.ts. Never accepts a client-supplied business_id: the
 * inbound payload's `phone_number_id` is resolved server-side via
 * resolveBusinessFromWhatsappPhoneNumberId(). Reuses the exact same
 * conversation/message/AI/lead/escalation services the widget uses --
 * per docs/phases.md's Phase 16 hard constraint, this must never become a
 * second AI system.
 */
export const maxDuration = 60;

// No IP-scope limit here -- Meta's webhook always comes from Meta's own
// infrastructure, so a per-sender-id limit (below) is the meaningful one.
const WA_ID_LIMIT = 30;
const CONVERSATION_LIMIT = 20;
const RATE_LIMIT_WINDOW_SECONDS = 300;
const HISTORY_LIMIT = 20;

const NON_TEXT_REPLY =
  "I can only read text messages right now — could you type your question instead? Thanks for your patience.";

// 2026-09-11 follow-up: sent instead of pure silence when askSalesEmployee()
// throws, so a prospect never gets met with nothing. Honest, not a
// fabricated answer -- doesn't claim to know anything about their question.
const FALLBACK_REPLY =
  "Sorry, I'm having trouble responding right now — someone from our team will follow up with you shortly.";

type WhatsappWebhookValue = {
  metadata?: { phone_number_id?: string };
  messages?: { id?: string; from?: string; type?: string; text?: { body?: string } }[];
};

type WhatsappWebhookBody = {
  entry?: { changes?: { value?: WhatsappWebhookValue }[] }[];
};

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Meta's one-time webhook verification handshake, run once when the callback URL is registered in the Meta App dashboard. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken || mode !== "subscribe" || token !== verifyToken || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = await request.text();

  if (!appSecret || !verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response(null, { status: 401 });
  }

  let body: WhatsappWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  const values = (body.entry ?? []).flatMap((entry) => (entry.changes ?? []).map((change) => change.value));

  for (const value of values) {
    if (!value?.metadata?.phone_number_id || !value.messages) continue;

    for (const message of value.messages) {
      try {
        await handleInboundMessage(supabase, value.metadata.phone_number_id, message);
      } catch (error) {
        // A single malformed/failed message must never take down the rest
        // of the batch, and must never fail the webhook response itself
        // (a non-2xx makes Meta retry the whole payload indefinitely).
        logAndGetUserMessage(error);
      }
    }
  }

  // Always 200 once signature verification passes -- per-message failures
  // are logged above, not surfaced as an HTTP error Meta would retry.
  return new Response(null, { status: 200 });
}

async function handleInboundMessage(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  phoneNumberId: string,
  message: NonNullable<WhatsappWebhookValue["messages"]>[number],
): Promise<void> {
  if (!message.id || !message.from) return;

  const resolved = await resolveBusinessFromWhatsappPhoneNumberId(supabase, phoneNumberId);
  if (!resolved) {
    logEvent("whatsapp_unknown_phone_number_id", "unknown", {}, "error");
    return;
  }
  const { businessId } = resolved;

  const waIdAllowed = await checkAndIncrementRateLimit("whatsapp_webhook", message.from, WA_ID_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (!waIdAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "whatsapp_webhook" }, "error");
    return;
  }

  // Dedup: Meta retries a webhook on any non-2xx/timeout. Attempted before
  // any other write so a redelivery is a pure no-op.
  const { error: dedupError } = await supabase
    .from("whatsapp_inbound_messages")
    .insert({ business_id: businessId, whatsapp_message_id: message.id });
  if (dedupError) {
    // 23505 = unique_violation -- already processed (or a concurrent
    // redelivery is processing it right now). Any other error is logged
    // but still treated as "don't double-process," the safer failure mode.
    if (dedupError.code !== "23505") {
      logEvent("whatsapp_dedup_write_failed", businessId, {}, "error");
    }
    return;
  }

  const conversation = await getOrCreateWhatsappConversation(supabase, businessId, message.from);

  const conversationAllowed = await checkAndIncrementRateLimit(
    "conversation",
    conversation.id,
    CONVERSATION_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!conversationAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "conversation" }, "error");
    return;
  }

  const isText = message.type === "text" && typeof message.text?.body === "string";
  const inboundContent = isText ? message.text!.body!.slice(0, 2000) : `[Received a "${message.type ?? "unknown"}" message]`;

  await createMessage(supabase, businessId, conversation.id, "user", inboundContent);

  // WhatsApp's own platform opt-in (a prospect messaging the business
  // number in the first place) stands in for the widget's consent
  // checkbox -- recorded unconditionally, idempotently, on every inbound
  // message. See STATE.md's decision record for the full reasoning.
  await recordConversationConsent(supabase, businessId, conversation.id);

  if (conversation.control === "human") {
    // A human already owns this thread -- no automated reply, AI or
    // canned, while they're in control. The inbound message above is
    // still persisted so staff see it.
    return;
  }

  if (!isText) {
    await sendCannedReply(supabase, businessId, conversation.id, phoneNumberId, message.from, NON_TEXT_REPLY);
    return;
  }

  const businessContext = await loadBusinessAiContext(businessId);
  if (!businessContext) {
    logEvent("whatsapp_business_context_missing", businessId, {}, "error");
    return;
  }

  const history = await listRecentMessages(supabase, businessId, conversation.id, HISTORY_LIMIT);

  let response: Awaited<ReturnType<typeof askSalesEmployee>>;
  try {
    response = await askSalesEmployee(
      supabase,
      businessId,
      conversation.id,
      businessContext.businessName,
      businessContext.businessProfile,
      inboundContent,
      history,
      businessContext.language,
      {
        recommendProductsEnabled: businessContext.recommendProductsEnabled,
        appointmentsEnabled: businessContext.appointmentsEnabled,
      },
    );
  } catch (error) {
    // A thrown error here used to mean total silence: the outer POST
    // handler's own try/catch (which must never fail the webhook
    // response, or Meta retries the whole payload) swallows it with no
    // reply ever sent and nothing visible unless someone checks Sentry.
    // logAndGetUserMessage() still reports to Sentry (2026-09-11
    // follow-up) -- this doesn't hide the root cause, it just stops the
    // prospect from being met with silence, and flags the conversation so
    // a human notices instead of it vanishing.
    logAndGetUserMessage(error);
    await sendReply(
      supabase,
      businessId,
      conversation.id,
      (await createMessage(supabase, businessId, conversation.id, "assistant", FALLBACK_REPLY)).id,
      phoneNumberId,
      message.from,
      FALLBACK_REPLY,
    );
    await flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);
    logEvent("whatsapp_ai_reply_failed", businessId, { conversationId: conversation.id }, "error");
    return;
  }

  const assistantMessageRow = await createMessage(
    supabase,
    businessId,
    conversation.id,
    "assistant",
    response.answer,
    response.sourceChunkIds,
    response.grounded,
  );

  if (!response.grounded && !response.escalate) {
    const { error: unansweredError } = await supabase
      .from("unanswered_questions")
      .insert({ business_id: businessId, conversation_id: conversation.id, question: inboundContent });
    if (unansweredError) {
      logEvent("unanswered_question_log_failed", businessId, { conversationId: conversation.id }, "error");
    }
  }

  if (response.escalate) {
    await flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);
    logEvent("whatsapp_escalation_triggered", businessId, { conversationId: conversation.id });
  }

  await sendReply(supabase, businessId, conversation.id, assistantMessageRow.id, phoneNumberId, message.from, response.answer);
}

async function sendCannedReply(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  businessId: string,
  conversationId: string,
  phoneNumberId: string,
  toWaId: string,
  content: string,
): Promise<void> {
  const messageRow = await createMessage(supabase, businessId, conversationId, "assistant", content);
  await sendReply(supabase, businessId, conversationId, messageRow.id, phoneNumberId, toWaId, content);
}

async function sendReply(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  businessId: string,
  conversationId: string,
  messageId: string,
  phoneNumberId: string,
  toWaId: string,
  content: string,
): Promise<void> {
  const outbound = await createWhatsappOutboundMessage(supabase, {
    businessId,
    conversationId,
    messageId,
    toWaId,
    phoneNumberId,
    content,
  });
  // Best-effort inline attempt -- a failure here is not fatal, the shared
  // daily cron sweep (processWhatsappOutboundMessages) retries it.
  await sendWhatsappOutboundMessage(outbound.id);
}
