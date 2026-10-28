import crypto from "node:crypto";
import { after, NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { selectBurstLimit } from "@/lib/abuse-limits";
import { checkReplyQuota } from "@/lib/usage-limit";
import { loadBusinessAiContext } from "@/lib/business-ai-context";
import {
  getOrCreateInstagramConversation,
  resolveBusinessFromInstagramAccountId,
} from "@/lib/instagram";
import { createInstagramOutboundMessage, sendInstagramOutboundMessage } from "@/lib/instagram-delivery";
import {
  flagConversationNeedsAttention,
  recordConversationConsent,
} from "@/lib/conversations";
import { createMessage, listRecentMessages } from "@/lib/messages";
import { askSalesEmployee } from "@/lib/rag";
import { canAgentServe } from "@/lib/agent-serving";
import { prepareProspectMessage } from "@/lib/guardrails/prepare-message";
import { recordGuardrailSignals } from "@/lib/guardrails/record";
import { resolveInputGuardrailAction } from "@/lib/guardrails/response-policy";
import { countAbuseStrikes } from "@/lib/guardrails/events";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";
import { sendUsageReminderIfDue } from "@/lib/usage-reminders";

/**
 * Phase 26's inbound Instagram DM receiver -- the Instagram analog of
 * app/api/webhooks/whatsapp/route.ts. Never accepts a client-supplied
 * business_id: the inbound payload's receiving-account id (`entry.id`) is
 * resolved server-side via resolveBusinessFromInstagramAccountId().
 * Reuses the exact same conversation/message/AI/lead/escalation services
 * as the widget and WhatsApp -- per docs/phases.md's hard constraint,
 * this must never become a second AI system.
 *
 * Payload shape is Messenger-platform-style (`entry[].messaging[]`), NOT
 * WhatsApp Cloud API's shape (`entry[].changes[].value.messages[]`) --
 * confirmed live against Meta's current docs during implementation, do
 * not assume the two are structurally interchangeable.
 */
export const maxDuration = 60;

// No IP-scope limit here -- Meta's webhook always comes from Meta's own
// infrastructure, so a per-sender-id limit (below) is the meaningful one.
const IG_SENDER_LIMIT = 30;
const CONVERSATION_LIMIT = 20;
const RATE_LIMIT_WINDOW_SECONDS = 300;
const HISTORY_LIMIT = 20;

const NON_TEXT_REPLY =
  "I can only read text messages right now — could you type your question instead? Thanks for your patience.";

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
};

type InstagramWebhookEntry = {
  id?: string;
  messaging?: InstagramMessagingEvent[];
};

type InstagramWebhookBody = {
  object?: string;
  entry?: InstagramWebhookEntry[];
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

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken || mode !== "subscribe" || token !== verifyToken || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const rawBody = await request.text();

  if (!appSecret || !verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response(null, { status: 401 });
  }

  let body: InstagramWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  for (const entry of body.entry ?? []) {
    if (!entry.id || !entry.messaging) continue;

    for (const event of entry.messaging) {
      try {
        await handleInboundMessage(supabase, entry.id, event);
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
  instagramBusinessAccountId: string,
  event: InstagramMessagingEvent,
): Promise<void> {
  // Echoes are this account's OWN outbound messages reflected back --
  // never process them as an inbound prospect message (WhatsApp's Cloud
  // API has no equivalent concept; this is specific to Instagram's
  // Messenger-platform-style webhook).
  if (event.message?.is_echo) return;
  if (!event.message?.mid || !event.sender?.id) return;

  const resolved = await resolveBusinessFromInstagramAccountId(supabase, instagramBusinessAccountId);
  if (!resolved) {
    logEvent("instagram_unknown_account_id", "unknown", { instagramBusinessAccountId }, "error");
    return;
  }
  const { businessId } = resolved;

  const senderAllowed = await checkAndIncrementRateLimit(
    "instagram_webhook",
    event.sender.id,
    IG_SENDER_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!senderAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "instagram_webhook" }, "error");
    return;
  }

  // Dedup: Meta retries a webhook on any non-2xx/timeout. Attempted before
  // any other write so a redelivery is a pure no-op.
  const { error: dedupError } = await supabase
    .from("instagram_inbound_messages")
    .insert({ business_id: businessId, instagram_message_id: event.message.mid });
  if (dedupError) {
    // 23505 = unique_violation -- already processed (or a concurrent
    // redelivery is processing it right now). Any other error is logged
    // but still treated as "don't double-process," the safer failure mode.
    if (dedupError.code !== "23505") {
      logEvent("instagram_dedup_write_failed", businessId, {}, "error");
    }
    return;
  }

  // Phase 32 business_burst (log-only): one burst ceiling spanning all of a
  // tenant's channels (widget + WhatsApp + Instagram), keyed on business_id,
  // so a business cannot be hit on three paths at once with each counting
  // separately. Loaded here after dedup -- so a Meta redelivery never inflates
  // the bucket -- and the entitlement is reused as askSalesEmployee()'s
  // prefetched quota below, so the trial-vs-normal ceiling (decision 3) costs
  // no extra read. Log-only, so the verdict is not acted on yet.
  const quota = await checkReplyQuota(supabase, businessId);
  const burstProfile = selectBurstLimit(quota.entitlement.status);
  await checkAndIncrementRateLimit("business_burst", businessId, burstProfile.limit, burstProfile.windowSeconds, businessId);

  const conversation = await getOrCreateInstagramConversation(supabase, businessId, event.sender.id);

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

  const isText = typeof event.message.text === "string" && event.message.text.length > 0;
  // Guardrails Phase 1: sanitised, capped and masked before it is stored or
  // sent to the model; `event.message.text` is read only here.
  const prepared = isText ? prepareProspectMessage(event.message.text!) : null;
  const inboundContent = prepared ? prepared.text : "[Received a non-text message]";
  if (prepared) {
    after(() => recordGuardrailSignals(businessId, conversation.id, "instagram", prepared.signals));
  }

  await createMessage(supabase, businessId, conversation.id, "user", inboundContent);

  // Instagram's own platform opt-in (a prospect messaging the business's
  // Instagram account in the first place) stands in for the widget's
  // consent checkbox, same reasoning as WhatsApp's D15 decision.
  await recordConversationConsent(supabase, businessId, conversation.id);

  if (conversation.control === "human") {
    // A human already owns this thread -- no automated reply, AI or
    // canned, while they're in control. The inbound message above is
    // still persisted so staff see it.
    return;
  }

  // Billing hardening: a subscription that no longer lets the agent serve
  // sends NO reply at all -- not the AI's, not a canned one. The inbound
  // message above is already stored, so the owner still sees the lead.
  if (!(await canAgentServe(businessId))) {
    logEvent("instagram_agent_not_serving", businessId, { conversationId: conversation.id });
    return;
  }

  if (!isText) {
    await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, event.sender.id, NON_TEXT_REPLY);
    return;
  }

  const businessContext = await loadBusinessAiContext(businessId);
  if (!businessContext) {
    logEvent("instagram_business_context_missing", businessId, {}, "error");
    return;
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
    await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, event.sender.id, inputAction.reply);
    return;
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
    "webhook_instagram",
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
    logEvent("instagram_escalation_triggered", businessId, { conversationId: conversation.id });
  }

  await sendReply(
    supabase,
    businessId,
    conversation.id,
    assistantMessageRow.id,
    instagramBusinessAccountId,
    event.sender.id,
    response.answer,
  );

  // Phase 17a: same quota reminder dispatch as the chat route and the
  // WhatsApp webhook -- one quota covers every channel, so every channel
  // has to be able to warn about it. In after() so Meta's webhook
  // acknowledgement is never held up by an outbound email.
  after(() =>
    sendUsageReminderIfDue(
      supabase,
      businessId,
      response.quotaSnapshot,
      response.quotaSnapshot.repliesUsed + (response.metricsRowId ? 1 : 0),
    ),
  );
}

async function sendCannedReply(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  businessId: string,
  conversationId: string,
  instagramBusinessAccountId: string,
  toIgId: string,
  content: string,
): Promise<void> {
  const messageRow = await createMessage(supabase, businessId, conversationId, "assistant", content);
  await sendReply(supabase, businessId, conversationId, messageRow.id, instagramBusinessAccountId, toIgId, content);
}

async function sendReply(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  businessId: string,
  conversationId: string,
  messageId: string,
  instagramBusinessAccountId: string,
  toIgId: string,
  content: string,
): Promise<void> {
  const outbound = await createInstagramOutboundMessage(supabase, {
    businessId,
    conversationId,
    messageId,
    toIgId,
    instagramBusinessAccountId,
    content,
  });
  // Best-effort inline attempt -- a failure here is not fatal, the shared
  // daily cron sweep (processInstagramOutboundMessages) retries it.
  await sendInstagramOutboundMessage(outbound.id);
}
