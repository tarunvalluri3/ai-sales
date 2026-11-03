import { after, NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { selectBurstLimit } from "@/lib/abuse-limits";
import { checkReplyQuota, type ReplyQuotaStatus } from "@/lib/usage-limit";
import { isInstagramAllowed } from "@/lib/subscription";
import {
  isExpectedRefusal,
  loadBusinessAiContext,
  type BusinessAiContextResult,
} from "@/lib/business-ai-context";
import {
  getOrCreateInstagramConversation,
  resolveBusinessFromInstagramAccountId,
} from "@/lib/instagram";
import {
  createInstagramOutboundMessage,
  deliverInstagramOutbound,
  sendInstagramSenderActions,
  type InstagramSendResult,
} from "@/lib/instagram-delivery";
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
import { embedQueryWithCache } from "@/lib/answer-bank/store";
import { kickAnswerBankRefresh } from "@/lib/answer-bank/generate";
import type { InstantContext } from "@/lib/answer-bank/decision";
import { TurnTimer } from "@/lib/turn-timings";
import { finalizeTurnMetrics, writeDeferredTurnMetrics } from "@/lib/ai-response-metrics";
import { logEvent } from "@/lib/logger";
import { logAndGetUserMessage } from "@/lib/errors";
import { sendUsageReminderIfDue } from "@/lib/usage-reminders";
import { markInboundReplyStatus, reportChannelReplyFailure } from "@/lib/channel-reply-failure";
import {
  REPLY_FAILED_FALLBACK_MESSAGE,
  runReplyWithFallback,
  type ReplyAttemptState,
} from "@/lib/channel-reply-rules";
import type { Conversation } from "@/lib/supabase/types";
import {
  summarizeInstagramReplyTiming,
  type InstagramReplyMilestones,
  type InstagramReplyOutcome,
} from "@/lib/instagram-reply-timing";
import {
  extractInboundMessages,
  resolveVerificationChallenge,
  verifyWebhookSignature,
  type InboundMessage,
  type InstagramWebhookBody,
} from "@/lib/meta-instagram-rules";

/**
 * Inbound Instagram DMs (Instagram API with Facebook Login -- Messenger API
 * support for Instagram -- or Unified Login; the payload is the same:
 * object "instagram", entry.id = the Instagram professional account id,
 * sender.id = the customer's Instagram-scoped id). Meta signs every
 * POST with X-Hub-Signature-256 using META_APP_SECRET. The business is
 * resolved from `entry.id` (the client's Instagram account id) server-side,
 * never from anything a client controls. Reuses the same conversation,
 * message, AI, lead and escalation services as the widget and WhatsApp.
 *
 * Fast path (before the 200): verify, de-duplicate by message id, store the
 * inbound message. The AI reply runs afterwards in after() -- in this same
 * invocation, not a queue or cron -- so Meta gets its 200 quickly. Never logs
 * tokens or message text.
 *
 * Latency pass (2026-11-02): the reply now uses the widget's own speed-ups --
 * one TurnTimer per turn started when the webhook arrives, the cached query
 * embedding started early (query_embedding_cache), instant answers, the
 * deferred metrics write -- and every independent read runs in parallel and
 * is started as soon as the business is known. All post-reply work runs
 * after the Send API call. One `ig_reply_timing` log line per turn.
 */
export const maxDuration = 60;

// Meta's webhook always comes from Meta's own infrastructure, so a
// per-sender limit is the meaningful one (no IP scope).
const IG_SENDER_LIMIT = 30;
const CONVERSATION_LIMIT = 20;
const RATE_LIMIT_WINDOW_SECONDS = 300;
// Same cap as the widget (app/api/chat/route.ts).
const HISTORY_LIMIT = 20;

const NON_TEXT_REPLY =
  "I can only read text messages right now — could you type your question instead? Thanks for your patience.";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const ignoreRejection = () => undefined;

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
  // The real start of every turn in this payload: each reply's timer starts here.
  const receivedAt = Date.now();
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response(null, { status: 401 });
  }
  const signatureVerifiedAtMs = Date.now() - receivedAt;

  let body: InstagramWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  for (const inbound of extractInboundMessages(body)) {
    try {
      const ingested = await ingestInboundMessage(supabase, inbound, receivedAt);
      if (ingested) {
        const milestones: InstagramReplyMilestones = {
          signatureVerifiedAtMs,
          messageSavedAtMs: ingested.messageSavedAtMs,
          backgroundStartedAtMs: null,
          contextLoadedAtMs: null,
          llmCompleteAtMs: null,
          metaSendReturnedAtMs: null,
        };
        after(async () => {
          try {
            await replyToInboundMessage(supabase, inbound, ingested, milestones);
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

/**
 * Reads started during ingest and awaited by the reply, so their round trips
 * overlap the ingest writes instead of following them. Each has a no-op
 * rejection handler attached; the reply awaits the original promise, so a
 * real failure still surfaces there.
 */
type ReplyPrefetch = {
  context: Promise<BusinessAiContextResult>;
  serving: Promise<boolean>;
  quota: Promise<ReplyQuotaStatus>;
  /** The question's embedding (query_embedding_cache first), started once every gate has passed. Text messages only. */
  queryEmbedding: Promise<number[]> | undefined;
  /** Writes a freshly computed embedding to the cache; read after the turn, off the reply path. */
  storeQueryEmbedding: () => (() => Promise<void>) | null;
};

type IngestedMessage = {
  businessId: string;
  conversation: Conversation;
  prepared: PreparedProspectMessage | null;
  inboundContent: string;
  timer: TurnTimer;
  prefetch: ReplyPrefetch;
  messageSavedAtMs: number;
  /** When the webhook POST reached us (epoch ms). */
  receivedAt: number;
};

/** Resolves the business, de-duplicates and stores the message. Returns null when nothing more should happen. */
async function ingestInboundMessage(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
  receivedAt: number,
): Promise<IngestedMessage | null> {
  const resolved = await resolveBusinessFromInstagramAccountId(supabase, inbound.accountId);
  if (!resolved) {
    logEvent("instagram_unknown_account_id", "unknown", {}, "info");
    return null;
  }
  const { businessId } = resolved;

  // Instagram is allowed only on a plan that includes it or with the
  // business's service-role-only override. Otherwise the message is not
  // stored or answered (still a 200, so Meta does not retry it). The sender
  // rate limit is checked in the same round trip; both gate before any write.
  const [instagramAllowed, senderAllowed] = await Promise.all([
    isInstagramAllowed(supabase, businessId),
    checkAndIncrementRateLimit("instagram_webhook", inbound.senderId, IG_SENDER_LIMIT, RATE_LIMIT_WINDOW_SECONDS),
  ]);
  if (!instagramAllowed) {
    logEvent("instagram_not_allowed", businessId, {}, "info");
    return null;
  }
  if (!senderAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "instagram_webhook" }); // info, not Sentry: a flood must not burn the error quota (LAUNCH_AUDIT.md §1)
    return null;
  }

  // Dedup across deliveries: Meta retries on any non-2xx/timeout. The unique
  // insert happens before any other write, so a redelivery is a no-op.
  const { error: dedupError } = await supabase
    .from("instagram_inbound_messages")
    .insert({ business_id: businessId, instagram_message_id: inbound.mid, reply_status: "pending" });
  if (dedupError) {
    // 23505 = already processed (or being processed). Any other error is
    // logged but still treated as "don't double-process".
    if (dedupError.code !== "23505") {
      logEvent("instagram_dedup_write_failed", businessId, {}, "error");
    }
    return null;
  }

  // From here on this message will be stored, so start the reply's reads now:
  // they run while the conversation is found and the message is written.
  const timer = new TurnTimer(receivedAt);
  const context = timer.time("context_load", () => loadBusinessAiContext(businessId));
  context.catch(ignoreRejection);
  const serving = timer.time("serving_check", () => canAgentServe(businessId));
  serving.catch(ignoreRejection);
  const quota = timer.time("quota_check", () => checkReplyQuota(supabase, businessId));
  quota.catch(ignoreRejection);

  const conversation = await timer.time("conversation_lookup", () =>
    getOrCreateInstagramConversation(supabase, businessId, inbound.senderId),
  );

  const [, conversationAllowed] = await Promise.all([
    (async () => {
      await supabase
        .from("instagram_inbound_messages")
        .update({ conversation_id: conversation.id })
        .eq("business_id", businessId)
        .eq("instagram_message_id", inbound.mid);
    })(),
    timer.time("rate_limit_conversation", () =>
      checkAndIncrementRateLimit("conversation", conversation.id, CONVERSATION_LIMIT, RATE_LIMIT_WINDOW_SECONDS),
    ),
  ]);
  if (!conversationAllowed) {
    logEvent("rate_limit_exceeded", businessId, { scope: "conversation" }); // info, not Sentry: a flood must not burn the error quota (LAUNCH_AUDIT.md §1)
    await markInboundReplyStatus(supabase, "instagram", businessId, inbound.mid, "skipped");
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

  // Same as the widget: every rate limit has passed, so start the question's
  // embedding now (reusing a cached one for a repeated question). It overlaps
  // the writes below and the reply's gate reads. A turn that never reaches
  // retrieval (human control, not serving, instant answer) just drops it.
  let storeQueryEmbedding: (() => Promise<void>) | null = null;
  let queryEmbedding: Promise<number[]> | undefined;
  if (prepared && !prepared.empty) {
    const embedStartedAt = Date.now();
    const embedded = embedQueryWithCache(supabase, businessId, prepared.text);
    queryEmbedding = embedded.then((result) => result.embedding);
    queryEmbedding.catch(ignoreRejection);
    embedded.then(
      (result) => {
        storeQueryEmbedding = result.store;
        timer.record("embedding_prefetch", Date.now() - embedStartedAt);
      },
      ignoreRejection,
    );
  }

  // Messaging the business's Instagram account is the person's own opt-in
  // (same reasoning as WhatsApp's D15 decision). Independent writes, so they
  // run together (the widget does the same).
  await timer.time("user_message_write", () =>
    Promise.all([
      createMessage(supabase, businessId, conversation.id, "user", inboundContent),
      recordConversationConsent(supabase, businessId, conversation.id),
    ]),
  );

  return {
    businessId,
    conversation,
    prepared,
    inboundContent,
    timer,
    prefetch: { context, serving, quota, queryEmbedding, storeQueryEmbedding: () => storeQueryEmbedding },
    messageSavedAtMs: timer.elapsedMs(),
    receivedAt,
  };
}

/** Everything after the 200: gates, then the canned or AI reply, then the follow-up work. */
async function replyToInboundMessage(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
  ingested: IngestedMessage,
  milestones: InstagramReplyMilestones,
): Promise<void> {
  const { businessId, conversation, timer } = ingested;
  milestones.backgroundStartedAtMs = timer.elapsedMs();

  let outcome: InstagramReplyOutcome = "error";
  let model: string | null = null;
  let sent: boolean | null = null;
  // Fire-and-forget work, awaited only at the very end so it completes
  // inside this invocation without ever delaying the reply.
  const background: Promise<unknown>[] = [];
  try {
    // Production readiness (item 2), the shared orchestration
    // (lib/channel-reply-rules.ts runReplyWithFallback): ANY failure -- every
    // Gemini error, not just a timeout, or a database error -- is reported
    // (Sentry + an alertable `instagram_reply_failed` event), the conversation
    // is flagged for the team, and the prospect gets the fixed fallback unless
    // the real reply was already queued. The 24-hour window still applies to
    // it (deliverInstagramOutbound); it is always open for a message that
    // arrived seconds ago.
    await runReplyWithFallback({
      answer: async (state) => {
        const result = await answerInboundMessage(supabase, inbound, ingested, milestones, background, state);
        outcome = result.outcome;
        model = result.model;
        sent = result.sent;
        return outcome === "human_control" || outcome === "not_serving" ? "skipped" : "replied";
      },
      reportFailure: async (error, state) => {
        outcome = "error";
        await reportChannelReplyFailure({
          supabase,
          channel: "instagram",
          businessId,
          conversationId: conversation.id,
          clerkOrgId: state.clerkOrgId,
          error,
          stage: "ai_reply",
        });
      },
      sendFallback: async () => {
        sent = await sendFallbackReply(supabase, inbound, ingested);
      },
      markStatus: (status) => markInboundReplyStatus(supabase, "instagram", businessId, inbound.mid, status),
      onFallbackError: () => {
        sent = false;
        logEvent("instagram_reply_fallback_failed", businessId, { conversationId: conversation.id }, "error");
      },
    });
  } finally {
    logEvent(
      "ig_reply_timing",
      businessId,
      summarizeInstagramReplyTiming({
        conversationId: conversation.id,
        milestones,
        stages: timer.toStageTimings(),
        totalMs: timer.elapsedMs(),
        model,
        outcome,
        sent,
        metaDeliveryLagMs: inbound.sentAtMs === undefined ? null : ingested.receivedAt - inbound.sentAtMs,
      }),
    );
    await Promise.allSettled(background);
  }
}

type AnswerResult = { outcome: InstagramReplyOutcome; model: string | null; sent: boolean | null };

async function answerInboundMessage(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
  ingested: IngestedMessage,
  milestones: InstagramReplyMilestones,
  background: Promise<unknown>[],
  state: ReplyAttemptState,
): Promise<AnswerResult> {
  const { businessId, conversation, prepared, inboundContent, timer, prefetch } = ingested;
  const instagramBusinessAccountId = inbound.accountId;
  const isText = prepared !== null;

  if (conversation.control === "human") {
    // A human owns this thread: no automated reply. The message is stored.
    return { outcome: "human_control", model: null, sent: null };
  }

  // Every gate read was started during ingest; this mostly just collects them.
  const [agentServing, contextResult, quota, history, abuseStrikes] = await Promise.all([
    prefetch.serving,
    prefetch.context,
    prefetch.quota,
    // Read after the user message write, so it ends with this turn's message
    // (what isFirstTurn() and the duplicate-submit guard rely on).
    timer.time("history_fetch", () => listRecentMessages(supabase, businessId, conversation.id, HISTORY_LIMIT)),
    // Guardrails Phase 5: 0 without a query unless the abuse check is enforcing.
    isText ? countAbuseStrikes(supabase, businessId, conversation.id) : Promise.resolve(0),
  ]);

  // Billing hardening: a subscription that no longer lets the agent serve
  // sends NO reply at all. The inbound message is already stored.
  if (!agentServing) {
    logEvent("instagram_agent_not_serving", businessId, { conversationId: conversation.id });
    return { outcome: "not_serving", model: null, sent: null };
  }

  // Phase 32 business_burst (log-only): one burst ceiling across all of a
  // tenant's channels. Counted after dedup, so a redelivery never inflates it.
  // Its verdict is not used here, so it does not hold up the reply.
  const burstProfile = selectBurstLimit(quota.entitlement.status);
  background.push(
    checkAndIncrementRateLimit("business_burst", businessId, burstProfile.limit, burstProfile.windowSeconds, businessId),
  );

  // The shared channel gate: a suspended, soft-deleted or unpublished
  // business sends NO reply of any kind, canned replies included.
  if (!contextResult.ok) {
    const expected = isExpectedRefusal(contextResult.reason);
    logEvent(
      expected ? "instagram_agent_not_serving" : "instagram_business_context_missing",
      businessId,
      { conversationId: conversation.id, reason: contextResult.reason },
      expected ? "info" : "error",
    );
    return { outcome: "not_serving", model: null, sent: null };
  }
  const businessContext = contextResult.context;
  state.clerkOrgId = businessContext.clerkOrgId;
  milestones.contextLoadedAtMs = timer.elapsedMs();

  // A reply is coming: show "Seen" and "typing..." right away (Instagram
  // cannot stream). Never awaited on the reply path; failures are ignored.
  background.push(sendInstagramSenderActions(supabase, businessId, inbound.senderId, ["mark_seen", "typing_on"]));

  if (!isText) {
    const result = await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, inbound.senderId, NON_TEXT_REPLY, timer);
    state.replyQueued = true;
    milestones.metaSendReturnedAtMs = timer.elapsedMs();
    return { outcome: "canned", model: null, sent: result.success };
  }

  // Guardrails Phase 5: when an input check is ENFORCING the prospect gets a
  // fixed reply, the conversation is flagged, and the model is never called.
  const inputAction = resolveInputGuardrailAction(prepared?.signals ?? [], abuseStrikes);
  if (inputAction.kind !== "none") {
    const result = await sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, inbound.senderId, inputAction.reply, timer);
    state.replyQueued = true;
    milestones.metaSendReturnedAtMs = timer.elapsedMs();
    await flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);
    return { outcome: "canned", model: null, sent: result.success };
  }

  // Instant answers (greeting / suggested question / catalog / FAQ), exactly
  // as the widget serves them. `published` is true by construction:
  // loadBusinessAiContext() refuses an unpublished business.
  const instant: InstantContext = {
    businessName: businessContext.businessName,
    enabled: true,
    published: true,
    suggestedQuestions: businessContext.suggestedQuestions,
    suggestedClick: false,
  };

  // The same function, system prompt, grounding rules, model and history cap
  // as the widget's JSON path (app/api/chat/route.ts).
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
    timer,
    quota,
    prefetch.queryEmbedding,
    instant,
    // The metrics row is written after the reply is sent (below).
    true,
    "webhook_instagram",
    businessContext.liveSource,
  );
  milestones.llmCompleteAtMs = timer.elapsedMs();
  const usedModel = Boolean(response.metricsDraft || response.metricsRowId);

  const assistantMessageRow = await timer.time("assistant_message_write", () =>
    createMessage(
      supabase,
      businessId,
      conversation.id,
      "assistant",
      response.answer,
      response.sourceChunkIds,
      response.grounded,
      null,
      response.answerSource ?? "ai",
    ),
  );

  const sendResult = await sendReply(
    supabase,
    businessId,
    conversation.id,
    assistantMessageRow.id,
    instagramBusinessAccountId,
    inbound.senderId,
    response.answer,
    timer,
  );
  state.replyQueued = true;
  milestones.metaSendReturnedAtMs = timer.elapsedMs();

  // ---- Everything below runs after the reply has been sent. ----

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

  // The metrics row carries the full stage breakdown, send included.
  const metricsDraft = response.metricsDraft;
  if (metricsDraft) {
    background.push(writeDeferredTurnMetrics(supabase, metricsDraft, timer));
  } else {
    background.push(finalizeTurnMetrics(supabase, response.metricsRowId, businessId, timer));
  }

  const pendingEmbeddingWrite = prefetch.storeQueryEmbedding();
  if (pendingEmbeddingWrite) background.push(pendingEmbeddingWrite());
  if (response.instantMissReason === "no_fresh_entry") {
    background.push(kickAnswerBankRefresh(businessId));
  }

  // Phase 17a: one quota covers every channel, so every channel can warn.
  await sendUsageReminderIfDue(
    supabase,
    businessId,
    response.quotaSnapshot,
    response.quotaSnapshot.repliesUsed + (response.metricsRowId || metricsDraft ? 1 : 0),
  );

  return {
    outcome: usedModel ? "ai" : "instant",
    model: usedModel ? (process.env.GEMINI_CHAT_MODEL ?? null) : null,
    sent: sendResult.success,
  };
}

/** The fixed "our team will get back to you" reply after a failure. Returns whether it reached Meta. */
async function sendFallbackReply(
  supabase: ServiceSupabaseClient,
  inbound: InboundMessage,
  ingested: IngestedMessage,
): Promise<boolean> {
  const { businessId, conversation, timer } = ingested;
  const result = await sendCannedReply(
    supabase,
    businessId,
    conversation.id,
    inbound.accountId,
    inbound.senderId,
    REPLY_FAILED_FALLBACK_MESSAGE,
    timer,
  );
  return result.success;
}

async function sendCannedReply(
  supabase: ServiceSupabaseClient,
  businessId: string,
  conversationId: string,
  instagramBusinessAccountId: string,
  toIgId: string,
  content: string,
  timer: TurnTimer,
): Promise<InstagramSendResult> {
  const messageRow = await createMessage(supabase, businessId, conversationId, "assistant", content);
  return sendReply(supabase, businessId, conversationId, messageRow.id, instagramBusinessAccountId, toIgId, content, timer);
}

async function sendReply(
  supabase: ServiceSupabaseClient,
  businessId: string,
  conversationId: string,
  messageId: string,
  instagramBusinessAccountId: string,
  toIgId: string,
  content: string,
  timer: TurnTimer,
): Promise<InstagramSendResult> {
  const outbound = await timer.time("outbound_write", () =>
    createInstagramOutboundMessage(supabase, {
      businessId,
      conversationId,
      messageId,
      toIgId,
      instagramBusinessAccountId,
      content,
    }),
  );
  // Best-effort inline attempt using the row just created (no read-back);
  // the daily cron sweep retries failures.
  return timer.time("meta_send", () => deliverInstagramOutbound(outbound, supabase));
}
