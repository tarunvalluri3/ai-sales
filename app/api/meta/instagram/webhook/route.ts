import { after, NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { selectBurstLimit } from "@/lib/abuse-limits";
import { checkReplyQuota } from "@/lib/usage-limit";
import { isInstagramAllowed } from "@/lib/subscription";
import { isExpectedRefusal, loadBusinessAiContext } from "@/lib/business-ai-context";
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
import { prepareProspectMessage, type PreparedProspectMessage } from "@/lib/guardrails/prepare-message";
import { recordGuardrailSignals } from "@/lib/guardrails/record";
import { resolveInputGuardrailAction } from "@/lib/guardrails/response-policy";
import { countAbuseStrikes } from "@/lib/guardrails/events";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";
import { sendUsageReminderIfDue } from "@/lib/usage-reminders";
import type { Conversation } from "@/lib/supabase/types";
import {
  extractInboundMessages,
  resolveVerificationChallenge,
  verifyWebhookSignature,
  type InboundMessage,
  type InstagramWebhookBody,
} from "@/lib/meta-instagram-rules";

/**
 * Inbound Instagram DMs (Instagram API with Unified Login). Meta signs every
 * POST with X-Hub-Signature-256 using META_APP_SECRET. The business is
 * resolved from `entry.id` (the client's Instagram account id) server-side,
 * never from anything a client controls. Reuses the same conversation,
 * message, AI, lead and escalation services as the widget and WhatsApp.
 *
 * Fast path (before the 200): verify, de-duplicate by message id, store the
 * inbound message. The AI reply runs afterwards in after(), so Meta gets
 * its 200 quickly. Never logs tokens or message text.
 */
export const maxDuration = 60;

// Meta's webhook always comes from Meta's own infrastructure, so a
// per-sender limit is the meaningful one (no IP scope).
const IG_SENDER_LIMIT = 30;
const CONVERSATION_LIMIT = 20;
const RATE_LIMIT_WINDOW_SECONDS = 300;
const HISTORY_LIMIT = 20;

const NON_TEXT_REPLY =
  "I can only read text messages right now — could you type your question instead? Thanks for your patience.";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/** Meta's verification handshake, run when the callback URL is saved in the App Dashboard. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const challenge = resolveVerificationChallenge(
    { mode: params.get("hub.mode"), token: params.get("hub.verify_token"), challenge: params.get("hub.challenge") },
    process.env.META_WEBHOOK_VERIFY_TOKEN,
  );
  if (challenge === null) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response(null, { status: 401 });
  }

  let body: InstagramWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  for (const inbound of extractInboundMessages(body)) {
    try {
      const ingested = await ingestInboundMessage(supabase, inbound);
      if (ingested) {
        after(async () => {
          try {
            await replyToInboundMessage(supabase, inbound, ingested);
          } catch (error) {
            logAndGetUserMessage(error);
          }
        });
      }
    } catch (error) {
      // One failed message must never fail the batch or the response (a
      // non-2xx makes Meta retry the whole payload).
      logAndGetUserMessage(error);
    }
  }

  return new Response(null, { status: 200 });
}

type IngestedMessage = {
  businessId: string;
  conversation: Conversation;
  prepared: PreparedProspectMessage | null;
  inboundContent: string;
};

/** Resolves the business, de-duplicates and stores the message. Returns null when nothing more should happen. */
async function ingestInboundMessage(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
): Promise<IngestedMessage | null> {
  const resolved = await resolveBusinessFromInstagramAccountId(supabase, inbound.accountId);
  if (!resolved) {
    logEvent("instagram_unknown_account_id", "unknown", {}, "info");
    return null;
  }
  const { businessId } = resolved;

  // Instagram is allowed only on a plan that includes it or with the
  // business's service-role-only override. Otherwise the message is not
  // stored or answered (still a 200, so Meta does not retry it).
  if (!(await isInstagramAllowed(supabase, businessId))) {
    logEvent("instagram_not_allowed", businessId, {}, "info");
    return null;
  }

  const senderAllowed = await checkAndIncrementRateLimit(
    "instagram_webhook",
    inbound.senderId,
    IG_SENDER_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!senderAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "instagram_webhook" }, "error");
    return null;
  }

  // Dedup across deliveries: Meta retries on any non-2xx/timeout. The unique
  // insert happens before any other write, so a redelivery is a no-op.
  const { error: dedupError } = await supabase
    .from("instagram_inbound_messages")
    .insert({ business_id: businessId, instagram_message_id: inbound.mid });
  if (dedupError) {
    // 23505 = already processed (or being processed). Any other error is
    // logged but still treated as "don't double-process".
    if (dedupError.code !== "23505") {
      logEvent("instagram_dedup_write_failed", businessId, {}, "error");
    }
    return null;
  }

  const conversation = await getOrCreateInstagramConversation(supabase, businessId, inbound.senderId);

  await supabase
    .from("instagram_inbound_messages")
    .update({ conversation_id: conversation.id })
    .eq("business_id", businessId)
    .eq("instagram_message_id", inbound.mid);

  const conversationAllowed = await checkAndIncrementRateLimit(
    "conversation",
    conversation.id,
    CONVERSATION_LIMIT,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (!conversationAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "conversation" }, "error");
    return null;
  }

  // Guardrails Phase 1: sanitised, capped and masked before it is stored or
  // sent to the model; the raw text is read only here. Non-text messages
  // keep only a note that one arrived (no attachment is stored).
  const prepared = inbound.text !== null ? prepareProspectMessage(inbound.text) : null;
  const inboundContent = prepared ? prepared.text : "[Received a non-text message]";
  if (prepared) {
    after(() => recordGuardrailSignals(businessId, conversation.id, "instagram", prepared.signals));
  }

  await createMessage(supabase, businessId, conversation.id, "user", inboundContent);

  // Messaging the business's Instagram account is the person's own opt-in
  // (same reasoning as WhatsApp's D15 decision).
  await recordConversationConsent(supabase, businessId, conversation.id);

  return { businessId, conversation, prepared, inboundContent };
}

/** Everything after the 200: gates, then the canned or AI reply. */
async function replyToInboundMessage(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
  ingested: IngestedMessage,
): Promise<void> {
  const { businessId, conversation, prepared, inboundContent } = ingested;
  const instagramBusinessAccountId = inbound.accountId;
  const isText = prepared !== null;

  if (conversation.control === "human") {
    // A human owns this thread: no automated reply. The message is stored.
    return;
  }

  // Billing hardening: a subscription that no longer lets the agent serve
  // sends NO reply at all. The inbound message is already stored.
  if (!(await canAgentServe(businessId))) {
    logEvent("instagram_agent_not_serving", businessId, { conversationId: conversation.id });
    return;
  }

  // Phase 32 business_burst (log-only): one burst ceiling across all of a
  // tenant's channels. Counted after dedup, so a redelivery never inflates it.
  const quota = await checkReplyQuota(supabase, businessId);
  const burstProfile = selectBurstLimit(quota.entitlement.status);
  await checkAndIncrementRateLimit("business_burst", businessId, burstProfile.limit, burstProfile.windowSeconds, businessId);

  // The shared channel gate: a suspended, soft-deleted or unpublished
  // business sends NO reply of any kind, canned replies included.
  const contextResult = await loadBusinessAiContext(businessId);
  if (!contextResult.ok) {
    const expected = isExpectedRefusal(contextResult.reason);
    logEvent(
      expected ? "instagram_agent_not_serving" : "instagram_business_context_missing",
      businessId,
      { conversationId: conversation.id, reason: contextResult.reason },
      expected ? "info" : "error",
    );
    return;
  }
  const businessContext = contextResult.context;

  if (!isText) {
    await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, inbound.senderId, NON_TEXT_REPLY);
    return;
  }

  // Guardrails Phase 5: when an input check is ENFORCING the prospect gets a
  // fixed reply, the conversation is flagged, and the model is never called.
  const inputAction = resolveInputGuardrailAction(
    prepared?.signals ?? [],
    await countAbuseStrikes(supabase, businessId, conversation.id),
  );
  if (inputAction.kind !== "none") {
    await flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);
    await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, inbound.senderId, inputAction.reply);
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
    // No per-turn timer on this path; reuse the entitlement already loaded
    // for the burst check so quota is not read twice.
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
    inbound.senderId,
    response.answer,
  );

  // Phase 17a: one quota covers every channel, so every channel can warn.
  await sendUsageReminderIfDue(
    supabase,
    businessId,
    response.quotaSnapshot,
    response.quotaSnapshot.repliesUsed + (response.metricsRowId ? 1 : 0),
  );
}

async function sendCannedReply(
  supabase: ServiceSupabaseClient,
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
  supabase: ServiceSupabaseClient,
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
  // Best-effort inline attempt; the daily cron sweep retries failures.
  await sendInstagramOutboundMessage(outbound.id);
}
