import crypto from "node:crypto";
import { after, NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { selectBurstLimit } from "@/lib/abuse-limits";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isExpectedRefusal, loadBusinessAiContext } from "@/lib/business-ai-context";
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
import { canAgentServe } from "@/lib/agent-serving";
import { prepareProspectMessage, type PreparedProspectMessage } from "@/lib/guardrails/prepare-message";
import { recordGuardrailSignals } from "@/lib/guardrails/record";
import { resolveInputGuardrailAction } from "@/lib/guardrails/response-policy";
import { countAbuseStrikes } from "@/lib/guardrails/events";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";
import { sendUsageReminderIfDue } from "@/lib/usage-reminders";
import { markInboundReplyStatus, reportChannelReplyFailure } from "@/lib/channel-reply-failure";
import {
  REPLY_FAILED_FALLBACK_MESSAGE,
  runReplyWithFallback,
  type ReplyAttemptState,
} from "@/lib/channel-reply-rules";
import { extractWhatsappStatuses } from "@/lib/whatsapp-rules";
import { recordWhatsappStatuses } from "@/lib/whatsapp-status";
import type { Conversation } from "@/lib/supabase/types";

/**
 * Phase 16's inbound WhatsApp receiver -- the WhatsApp analog of
 * app/api/chat/route.ts. Never accepts a client-supplied business_id: the
 * inbound payload's `phone_number_id` is resolved server-side via
 * resolveBusinessFromWhatsappPhoneNumberId(). Reuses the exact same
 * conversation/message/AI/lead/escalation services the widget uses --
 * per docs/phases.md's Phase 16 hard constraint, this must never become a
 * second AI system.
 *
 * Production readiness (item 2, LAUNCH_AUDIT.md §1/§7/§13): same shape as the
 * Instagram webhook now.
 *  - Before the 200: verify, de-duplicate (the dedup row is written first, so a
 *    Meta redelivery is a no-op and can never produce a duplicate reply),
 *    store the inbound message. Meta gets its 200 without waiting on Gemini.
 *  - In after(): gates, then the AI/canned reply. ANY failure (every Gemini
 *    error, not just timeouts, or a database error) is reported to Sentry
 *    with its kind, the conversation is flagged for the team, and the
 *    prospect gets the fixed fallback -- unless the real reply was already
 *    queued. Each inbound row's `reply_status` records the outcome; a row left
 *    `pending` (instance killed mid-reply) is picked up by the recovery sweep
 *    (lib/inbound-reply-recovery.ts).
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

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

type WhatsappInboundMessage = { id?: string; from?: string; type?: string; text?: { body?: string } };

type WhatsappWebhookValue = {
  metadata?: { phone_number_id?: string };
  messages?: WhatsappInboundMessage[];
  statuses?: unknown[];
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
    if (!value?.metadata?.phone_number_id) continue;
    const phoneNumberId = value.metadata.phone_number_id;

    // Delivery receipts (sent / delivered / read / failed) for messages we
    // sent -- a template paused after approval or an undeliverable number
    // only shows up here (production readiness, item 4).
    const statuses = extractWhatsappStatuses(value.statuses);
    if (statuses.length > 0) {
      try {
        await recordWhatsappStatuses(supabase, phoneNumberId, statuses);
      } catch (error) {
        logAndGetUserMessage(error);
      }
    }

    for (const message of value.messages ?? []) {
      try {
        const ingested = await ingestInboundMessage(supabase, phoneNumberId, message);
        if (ingested) {
          after(() => replyToInboundMessage(supabase, ingested));
        }
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

type IngestedWhatsappMessage = {
  businessId: string;
  phoneNumberId: string;
  message: WhatsappInboundMessage & { id: string; from: string };
  conversation: Conversation;
  prepared: PreparedProspectMessage | null;
  inboundContent: string;
};

/** Resolves the business, de-duplicates and stores the message. Returns null when nothing more should happen. */
async function ingestInboundMessage(
  supabase: ServiceSupabaseClient,
  phoneNumberId: string,
  rawMessage: WhatsappInboundMessage,
): Promise<IngestedWhatsappMessage | null> {
  if (!rawMessage.id || !rawMessage.from) return null;
  const message = rawMessage as IngestedWhatsappMessage["message"];

  const resolved = await resolveBusinessFromWhatsappPhoneNumberId(supabase, phoneNumberId);
  if (!resolved) {
    logEvent("whatsapp_unknown_phone_number_id", "unknown", {}, "error");
    return null;
  }
  const { businessId } = resolved;

  const waIdAllowed = await checkAndIncrementRateLimit("whatsapp_webhook", message.from, WA_ID_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (!waIdAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "whatsapp_webhook" }); // info, not Sentry: a flood must not burn the error quota (LAUNCH_AUDIT.md §1)
    return null;
  }

  // Dedup: Meta retries a webhook on any non-2xx/timeout. Attempted before
  // any other write so a redelivery is a pure no-op -- including never
  // replying twice to the same message.
  const { error: dedupError } = await supabase
    .from("whatsapp_inbound_messages")
    .insert({ business_id: businessId, whatsapp_message_id: message.id, reply_status: "pending" });
  if (dedupError) {
    // 23505 = unique_violation -- already processed (or a concurrent
    // redelivery is processing it right now). Any other error is logged
    // but still treated as "don't double-process," the safer failure mode.
    if (dedupError.code !== "23505") {
      logEvent("whatsapp_dedup_write_failed", businessId, {}, "error");
    }
    return null;
  }

  const conversation = await getOrCreateWhatsappConversation(supabase, businessId, message.from);

  const [, conversationAllowed] = await Promise.all([
    // Lets the recovery sweep find the conversation if the reply is lost.
    supabase
      .from("whatsapp_inbound_messages")
      .update({ conversation_id: conversation.id })
      .eq("business_id", businessId)
      .eq("whatsapp_message_id", message.id),
    checkAndIncrementRateLimit("conversation", conversation.id, CONVERSATION_LIMIT, RATE_LIMIT_WINDOW_SECONDS),
  ]);
  if (!conversationAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "conversation" }); // info, not Sentry: a flood must not burn the error quota (LAUNCH_AUDIT.md §1)
    await markInboundReplyStatus(supabase, "whatsapp", businessId, message.id, "skipped");
    return null;
  }

  const isText = message.type === "text" && typeof message.text?.body === "string";
  // Guardrails Phase 1: sanitised, capped and masked before it is stored or
  // sent to the model; `message.text.body` is read only here.
  const prepared = isText ? prepareProspectMessage(message.text!.body!) : null;
  const inboundContent = prepared ? prepared.text : `[Received a "${message.type ?? "unknown"}" message]`;
  if (prepared) {
    after(() => recordGuardrailSignals(businessId, conversation.id, "whatsapp", prepared.signals));
  }

  await createMessage(supabase, businessId, conversation.id, "user", inboundContent);

  // WhatsApp's own platform opt-in (a prospect messaging the business
  // number in the first place) stands in for the widget's consent
  // checkbox -- recorded unconditionally, idempotently, on every inbound
  // message. See STATE.md's decision record for the full reasoning.
  await recordConversationConsent(supabase, businessId, conversation.id);

  return { businessId, phoneNumberId, message, conversation, prepared, inboundContent };
}

/**
 * Everything after the 200, through the shared orchestration
 * (lib/channel-reply-rules.ts runReplyWithFallback). Never throws: any failure
 * -- every Gemini error, not only a timeout, or a database error -- is
 * reported (Sentry + alertable `whatsapp_reply_failed`), the conversation is
 * flagged for the team, the fixed fallback goes to the prospect unless the
 * real reply was already queued, and the inbound row's reply_status records it.
 */
async function replyToInboundMessage(supabase: ServiceSupabaseClient, ingested: IngestedWhatsappMessage): Promise<void> {
  const { businessId, message, conversation } = ingested;
  await runReplyWithFallback({
    answer: (state) => answerInboundMessage(supabase, ingested, state),
    reportFailure: async (error, state) => {
      await reportChannelReplyFailure({
        supabase,
        channel: "whatsapp",
        businessId,
        conversationId: conversation.id,
        clerkOrgId: state.clerkOrgId,
        error,
        stage: "ai_reply",
      });
    },
    sendFallback: () => sendFallbackReply(supabase, ingested),
    markStatus: (status) => markInboundReplyStatus(supabase, "whatsapp", businessId, message.id, status),
    onFallbackError: () =>
      logEvent("whatsapp_reply_fallback_failed", businessId, { conversationId: conversation.id }, "error"),
  });
}

async function answerInboundMessage(
  supabase: ServiceSupabaseClient,
  ingested: IngestedWhatsappMessage,
  state: ReplyAttemptState,
): Promise<"replied" | "skipped"> {
  const { businessId, phoneNumberId, message, conversation, prepared, inboundContent } = ingested;
  const isText = prepared !== null;

  if (conversation.control === "human") {
    // A human already owns this thread -- no automated reply, AI or
    // canned, while they're in control. The inbound message is still
    // persisted so staff see it.
    return "skipped";
  }

  // Billing hardening: a subscription that no longer lets the agent serve
  // sends NO reply at all -- not the AI's, not a canned one. The inbound
  // message above is already stored (and the conversation exists), so the
  // owner still sees the lead in the dashboard and no lead is lost.
  if (!(await canAgentServe(businessId))) {
    logEvent("whatsapp_agent_not_serving", businessId, { conversationId: conversation.id });
    return "skipped";
  }

  // The shared channel gate (lib/business-ai-context.ts): a suspended,
  // soft-deleted or unpublished business sends NO reply of any kind -- checked
  // before the canned non-text reply too. The inbound message is stored above.
  const contextResult = await loadBusinessAiContext(businessId);
  if (!contextResult.ok) {
    const expected = isExpectedRefusal(contextResult.reason);
    logEvent(
      expected ? "whatsapp_agent_not_serving" : "whatsapp_business_context_missing",
      businessId,
      { conversationId: conversation.id, reason: contextResult.reason },
      expected ? "info" : "error",
    );
    return "skipped";
  }
  const businessContext = contextResult.context;
  state.clerkOrgId = businessContext.clerkOrgId;

  // Phase 32 business_burst (log-only): one burst ceiling spanning all of a
  // tenant's channels, keyed on business_id. Counted after dedup, so a Meta
  // redelivery never inflates it; the entitlement is reused as
  // askSalesEmployee()'s prefetched quota below.
  const quota = await checkReplyQuota(supabase, businessId);
  const burstProfile = selectBurstLimit(quota.entitlement.status);
  await checkAndIncrementRateLimit("business_burst", businessId, burstProfile.limit, burstProfile.windowSeconds, businessId);

  if (!isText) {
    await sendCannedReply(supabase, businessId, conversation.id, phoneNumberId, message.from, NON_TEXT_REPLY);
    state.replyQueued = true;
    return "replied";
  }

  // Guardrails Phase 5: when an input check is ENFORCING (lib/guardrails/config.ts; none
  // is yet) the prospect gets a fixed reply, the conversation is flagged for a human,
  // and the model is never called. Repeated abuse ends the AI's replies for good.
  const inputAction = resolveInputGuardrailAction(
    prepared?.signals ?? [],
    await countAbuseStrikes(supabase, businessId, conversation.id),
  );
  if (inputAction.kind !== "none") {
    await flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);
    await sendCannedReply(supabase, businessId, conversation.id, phoneNumberId, message.from, inputAction.reply);
    state.replyQueued = true;
    return "replied";
  }

  const history = await listRecentMessages(supabase, businessId, conversation.id, HISTORY_LIMIT);

  const response = await askSalesEmployee(
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
    // No per-turn timer on this path (webhook, not a prospect's live wait);
    // reuse the entitlement already loaded for the burst check so quota is not
    // read twice (same net reads as before Phase 32).
    undefined,
    quota,
    undefined,
    undefined,
    false,
    "webhook_whatsapp",
    businessContext.liveSource,
  );

  const assistantMessageRow = await createMessage(
    supabase,
    businessId,
    conversation.id,
    "assistant",
    response.answer,
    response.sourceChunkIds,
    response.grounded,
  );

  await sendReply(supabase, businessId, conversation.id, assistantMessageRow.id, phoneNumberId, message.from, response.answer);
  state.replyQueued = true;

  // ---- Everything below runs after the reply has been queued. ----

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

  // Phase 17a: the same quota reminder dispatch the website widget's chat
  // route does. This reply was counted against the same plan quota, so the
  // same 50/60/70/80/90/100% thresholds have to fire for it.
  await sendUsageReminderIfDue(
    supabase,
    businessId,
    response.quotaSnapshot,
    response.quotaSnapshot.repliesUsed + (response.metricsRowId ? 1 : 0),
  );

  return "replied";
}

/** The fixed "our team will get back to you" reply after a failure (inside the 24h window by construction). */
async function sendFallbackReply(supabase: ServiceSupabaseClient, ingested: IngestedWhatsappMessage): Promise<void> {
  const { businessId, phoneNumberId, message, conversation } = ingested;
  await sendCannedReply(supabase, businessId, conversation.id, phoneNumberId, message.from, REPLY_FAILED_FALLBACK_MESSAGE);
}

async function sendCannedReply(
  supabase: ServiceSupabaseClient,
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
  supabase: ServiceSupabaseClient,
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
  // Best-effort inline attempt -- a failure here is not fatal, the
  // scheduler's sweep (processWhatsappOutboundMessages) retries it.
  await sendWhatsappOutboundMessage(outbound.id);
}
