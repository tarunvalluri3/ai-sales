import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { logAndGetUserMessage, AppError } from "@/lib/errors";
import { resolveBusinessFromWidgetKey, WidgetAuthError, type WidgetBusinessContext } from "@/lib/widget-auth";
import {
  checkAndIncrementRateLimit,
  incrementRateLimitCounter,
  checkRateLimitsBatch,
  type BatchedRateLimitCheck,
} from "@/lib/rate-limit";
import {
  SCOPE_LIMITS,
  selectBurstLimit,
  resolveAbuseLimitVerdict,
  deriveIpv4Subnet,
  requiresNewConversationCheck,
} from "@/lib/abuse-limits";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  createConversation,
  flagConversationNeedsAttention,
  getConversationForBusiness,
  recordConversationConsent,
} from "@/lib/conversations";
import { createMessage, listRecentMessages } from "@/lib/messages";
import { askSalesEmployee, streamSalesEmployee, type SalesEmployeeResponse } from "@/lib/rag";
import { extractIp, extractOrigin, withCors } from "@/lib/http/widget-cors";
import { CORS_HEADERS } from "@/lib/http/widget-cors";
import { clientWantsStream, encodeStreamEvent, CHAT_STREAM_CONTENT_TYPE, type ChatStreamEvent } from "@/lib/chat-stream";
import { logEvent } from "@/lib/logger";
import { dispatchWorkflowTrigger } from "@/lib/workflow-engine";
import { dispatchNotification } from "@/lib/notification-dispatch";
import { getAppUrl } from "@/lib/app-url";
import { after } from "next/server";
import { CHAT_SERVER_MAX_DURATION_SECONDS } from "@/lib/chat-timeouts";
import { TurnTimer } from "@/lib/turn-timings";
import { finalizeTurnMetrics } from "@/lib/ai-response-metrics";
import { sendUsageReminderIfDue } from "@/lib/usage-reminders";
import { checkReplyQuota } from "@/lib/usage-limit";

/**
 * The one intentionally public, unauthenticated endpoint in this app
 * (docs/security.md §4). Never calls requireAuthContext()/auth.protect().
 * business_id is never accepted from the client -- it is resolved
 * server-side from widgetKey + the request's Origin/Referer header via
 * resolveBusinessFromWidgetKey().
 */

/**
 * A single request can make up to ~4 sequential Gemini calls (the bounded
 * tool-calling loop in askSalesEmployee(), MAX_TOOL_ITERATIONS iterations,
 * the last of which is normally the send_reply call, plus the fallback
 * structured-output call) -- comfortably within this limit but well above
 * a default serverless function timeout (Phase 19b,
 * docs/phase-19-audit-findings.md §10).
 *
 * This literal is the server end of the deadline ordering documented in
 * `lib/chat-timeouts.ts`, which is the source of truth: the widget's abort
 * is derived from it and must always be the later of the two, so that a
 * prospect can never be shown an error for a turn the server completed.
 * It has to be a literal here because Next.js reads this export
 * statically out of the built route, so the assertion below -- not an
 * import -- is what keeps the two from drifting: if either value changes
 * without the other, `npm run typecheck` fails.
 */
export const maxDuration = 60;

const _maxDurationMatchesSharedContract: typeof maxDuration extends typeof CHAT_SERVER_MAX_DURATION_SECONDS
  ? true
  : "app/api/chat/route.ts maxDuration must equal CHAT_SERVER_MAX_DURATION_SECONDS in lib/chat-timeouts.ts" = true;
void _maxDurationMatchesSharedContract;

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
});

/**
 * Phase 25b "source/page attribution": reduces an arbitrary client-supplied
 * URL to origin + pathname only, dropping the query string and fragment
 * (which can carry tracking tokens or other data this app has no reason
 * to store) and capping length -- defense in depth even though
 * public/widget-loader.js already sends a pre-stripped value. Returns
 * `null` for anything that doesn't parse as a URL, never throws.
 */
function sanitizeSourceUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const stripped = `${url.origin}${url.pathname}`;
    return stripped.slice(0, 500);
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  // The real start of the turn, on the handler's first line. Everything
  // below records into this one clock, so the persisted total is the
  // prospect's actual wait rather than a window that opens partway
  // through it -- the flaw the 2026-10-21 measurement pass found in
  // `latency_ms`, whose clock started after the quota check, the cache
  // read, the embedding call and the vector search had already run.
  const timer = new TurnTimer();
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

  const { widgetKey, conversationId, message, consentGiven, pageUrl, visitorId } = parsed.data;
  const origin = extractOrigin(request);
  const ip = extractIp(request);
  const ipSubnet = deriveIpv4Subnet(ip);

  // The existing `ip` scope plus the two Phase 32 IP-keyed abuse scopes
  // (STATE.md). All three need only the IP / request body, so they go in one
  // batched round trip (Stage B's check_rate_limits) before conversation
  // creation -- the placement a later enforcing stage needs (a hard-limit
  // rejection must not create a conversation). The abuse scopes are log-only
  // for now, so their verdicts are discarded here; only the enforcing `ip`
  // verdict gates. `ip_subnet` is skipped for a non-IPv4 address (decision 5);
  // `new_conversation_ip` applies only when no conversationId was sent
  // (decision 4).
  const ipChecks: BatchedRateLimitCheck[] = [
    { scope: "ip", identifier: ip, limit: IP_LIMIT, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
  ];
  if (ipSubnet) {
    ipChecks.push({
      scope: "ip_subnet",
      identifier: ipSubnet,
      limit: SCOPE_LIMITS.ip_subnet.limit,
      windowSeconds: SCOPE_LIMITS.ip_subnet.windowSeconds,
    });
  }
  if (requiresNewConversationCheck(conversationId)) {
    ipChecks.push({
      scope: "new_conversation_ip",
      identifier: ip,
      limit: SCOPE_LIMITS.new_conversation_ip.limit,
      windowSeconds: SCOPE_LIMITS.new_conversation_ip.windowSeconds,
    });
  }
  const ipResults = await timer.time("rate_limit_ip_batch", () => checkRateLimitsBatch(ipChecks));
  // Missing/malformed -> treat the enforcing `ip` scope as not allowed (fail
  // closed, unchanged for that scope).
  if (!ipResults.get("ip")?.allowed) {
    logEvent("rate_limit_exceeded", "unknown", { scope: "ip" }, "error");
    return withCors(jsonError("Too many requests.", 429));
  }

  let business: WidgetBusinessContext;
  try {
    business = await timer.time("widget_auth", () => resolveBusinessFromWidgetKey(widgetKey, origin));
  } catch (error) {
    if (error instanceof WidgetAuthError) {
      return withCors(jsonError("Invalid request.", 401));
    }
    const userMessage = logAndGetUserMessage(error);
    return withCors(jsonError(userMessage, 500));
  }

  const keyAllowed = await timer.time("rate_limit_key", () =>
    checkAndIncrementRateLimit("key", widgetKey, KEY_LIMIT, RATE_LIMIT_WINDOW_SECONDS),
  );
  if (!keyAllowed) {
    logEvent("rate_limit_exceeded", business.businessId, { scope: "key" }, "error");
    return withCors(jsonError("Too many requests.", 429));
  }

  const supabase = createServiceSupabaseClient();

  try {
    let conversation = conversationId
      ? await timer.time("conversation_lookup", () =>
          getConversationForBusiness(supabase, business.businessId, conversationId),
        )
      : null;

    if (conversationId && !conversation) {
      return withCors(jsonError("Invalid request.", 400));
    }

    if (!conversation) {
      conversation = await timer.time("conversation_create", () =>
        createConversation(
          supabase,
          business.businessId,
          "chat_widget",
          sanitizeSourceUrl(pageUrl),
          visitorId ?? null,
        ),
      );
    }

    // Read out before the closure below, which would otherwise widen
    // `conversation` back to possibly-null and need an assertion.
    const conversationRowId = conversation.id;
    const conversationAllowed = await timer.time("rate_limit_conversation", () =>
      checkAndIncrementRateLimit("conversation", conversationRowId, CONVERSATION_LIMIT, RATE_LIMIT_WINDOW_SECONDS),
    );
    if (!conversationAllowed) {
      logEvent("rate_limit_exceeded", business.businessId, { scope: "conversation" }, "error");
      return withCors(jsonError("Too many requests.", 429));
    }

    // Item 4 of the 2026-10-22 latency pass: three independent round trips
    // that used to run one after another now run concurrently, co-located
    // with Supabase in `icn1`. They are genuinely independent -- the
    // consent write, the user-message write, and the quota count share no
    // data and none gates another -- so overlapping them removes ~2 serial
    // round trips from the prospect's wait without weakening any rule:
    //
    //  - consent is still awaited before askSalesEmployee(), so a
    //    book_appointment/request_callback tool call this very turn still
    //    sees it (Phase 22c);
    //  - the user message is still persisted unconditionally, before the
    //    human-control check below, so a human reviewing the conversation
    //    sees every prospect message even while the AI is paused;
    //  - the quota verdict is computed here and handed to
    //    askSalesEmployee() (prefetchedQuota), which still refuses any
    //    Gemini call when the business is over quota -- the gate is
    //    unchanged, only its round trip now overlaps these writes instead
    //    of running sequentially at the top of askSalesEmployee().
    const [, userMessageRow, quota, burstCount] = await Promise.all([
      consentGiven
        ? timer.time("consent_write", () => recordConversationConsent(supabase, business.businessId, conversationRowId))
        : Promise.resolve(null),
      timer.time("user_message_write", () =>
        createMessage(supabase, business.businessId, conversationRowId, "user", message),
      ),
      timer.time("quota_check", () => checkReplyQuota(supabase, business.businessId)),
      // Phase 32 business_burst (log-only): one burst ceiling across ALL of a
      // tenant's channels. Only the raw increment runs here (it needs just the
      // scope/identifier/window), concurrently with the reads above so it adds
      // no latency; the trial-vs-normal ceiling is chosen below from the
      // entitlement the quota check just loaded -- no extra query (decision 3).
      timer.time("rate_limit_business_burst", () =>
        incrementRateLimitCounter("business_burst", business.businessId, SCOPE_LIMITS.business_burst.windowSeconds),
      ),
    ]);

    // Evaluate the burst counter against the right ceiling now that the
    // entitlement is known. Log-only in Stage A, so `burstVerdict.allowed`
    // is always true here; a later enforcing stage consumes it for the
    // soft-limit response path.
    const burstProfile = selectBurstLimit(quota.entitlement.status);
    const burstVerdict = resolveAbuseLimitVerdict("business_burst", burstCount, burstProfile.limit);
    if (burstVerdict.wouldExceed) {
      logEvent("rate_limit_would_exceed", business.businessId, {
        scope: "business_burst",
        requestCount: burstCount ?? -1,
        limit: burstProfile.limit,
      });
    }

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

    const history = await timer.time("history_fetch", () =>
      listRecentMessages(supabase, business.businessId, conversationRowId, HISTORY_LIMIT),
    );

    // Writes the assistant message row and returns it. Shared by the JSON
    // and streaming paths so both persist a turn identically. `interrupted`
    // (streaming only) stamps interrupted_at, so a cut-off streamed reply is
    // never indistinguishable from a complete one (design §d).
    const writeAssistantMessage = (response: SalesEmployeeResponse, interrupted: boolean) =>
      timer.time("assistant_message_write", () =>
        createMessage(
          supabase,
          business.businessId,
          conversationRowId,
          "assistant",
          response.answer,
          response.sourceChunkIds,
          response.grounded,
          interrupted ? new Date().toISOString() : null,
        ),
      );

    // The after-the-answer work, shared by both paths: unanswered-question
    // logging, escalation (flag + notification + workflow), metrics finalize
    // and usage reminders. Awaited parts mirror the JSON path's prior
    // behaviour exactly; the after() parts stay off the prospect's wait.
    // An interrupted streamed turn skips unanswered logging and reminders (it
    // did not complete), but still escalates when the response says so (a
    // mid-stream timeout escalates for human follow-up; a visitor who left
    // does not, because that response carries escalate:false).
    const finalizeTurnSideEffects = async (response: SalesEmployeeResponse, interrupted: boolean) => {
      // Phase 25b "top unanswered questions": only a genuine knowledge gap
      // (ungrounded, and not already escalated). A failure here must never
      // fail the prospect's real response.
      if (!interrupted && !response.grounded && !response.escalate) {
        const { error: unansweredError } = await timer.time("unanswered_question_write", async () =>
          await supabase
            .from("unanswered_questions")
            .insert({ business_id: business.businessId, conversation_id: conversationRowId, question: message }),
        );
        if (unansweredError) {
          logEvent("unanswered_question_log_failed", business.businessId, { conversationId: conversation.id }, "error");
        }
      }

      if (response.escalate) {
        // Flags the conversation for dashboard attention -- deliberately
        // does not change `control`. See prompts/phase-15a-handoff-state-and-ai-pause.md's
        // "Decisions and assumptions" #1.
        const flagResult = await timer.time("escalation_flag", () =>
          flagConversationNeedsAttention(supabase, business.businessId, conversationRowId, business.clerkOrgId),
        );
        logEvent("chat_escalation_triggered", business.businessId, { conversationId: conversation.id });

        // Gated on the transition into needing attention, not on every
        // escalated turn. after() so the prospect never waits on an email.
        if (!flagResult.wasAlreadyFlagged) {
          const conversationLink = `/dashboard/conversations/${conversation.id}`;
          after(() =>
            dispatchNotification({
              businessId: business.businessId,
              category: "human_handover",
              message: `A conversation needs a human: "${message}"`,
              link: conversationLink,
              supabase,
              email: {
                subject: `A conversation needs a human — ${business.businessName}`,
                heading: "Your AI handed a conversation to a human",
                paragraphs: ["The AI couldn't answer this one and flagged it for someone on your team."],
                facts: [{ label: "What they asked", value: message.slice(0, 200) }],
                cta: { label: "Take over the conversation", url: `${getAppUrl()}${conversationLink}` },
              },
            }),
          );
        }

        await timer.time("workflow_trigger", () =>
          dispatchWorkflowTrigger(supabase, business.businessId, "conversation_needs_attention", {
            type: "conversation",
            id: conversationRowId,
            customerId: conversation.customer_id,
            leadId: null,
            conversationId: conversationRowId,
          }),
        );
      }

      // Appends the post-reply stages and restamps the total. In after(), so
      // it costs the prospect nothing; a no-op when no success row was
      // written (an interrupted turn, a timeout, a cache hit).
      after(() => finalizeTurnMetrics(supabase, response.metricsRowId, business.businessId, timer));

      // Phase 17a quota reminder emails -- only for a completed turn. `+ 1`
      // only when this turn actually wrote an ai_response_metrics row.
      if (!interrupted) {
        after(() =>
          sendUsageReminderIfDue(
            supabase,
            business.businessId,
            response.quotaSnapshot,
            response.quotaSnapshot.repliesUsed + (response.metricsRowId ? 1 : 0),
          ),
        );
      }
    };

    // feat/chat-streaming: a loader that asked for a stream (its `Accept`
    // header or the `stream` body flag) gets Server-Sent Events; every
    // currently-live loader, which sends neither, falls through to the
    // byte-identical JSON path below. The human-control branch above already
    // returned JSON regardless -- a streaming loader detects a non-stream
    // content type and handles that JSON response as it always has.
    if (clientWantsStream(request.headers.get("accept"), parsed.data.stream)) {
      const abortController = new AbortController();
      const onClientAbort = () => abortController.abort();
      request.signal.addEventListener("abort", onClientAbort);
      const encoder = new TextEncoder();

      const sseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (event: ChatStreamEvent) => {
            try {
              controller.enqueue(encoder.encode(encodeStreamEvent(event)));
            } catch {
              // The connection is gone -- nothing more can be written, but
              // persistence below still runs so the turn is recorded.
            }
          };
          // First, always: lets the loader store the conversation id and the
          // polling cursor even if the stream then dies mid-answer.
          emit({ type: "meta", conversationId: conversation.id, asOf: userMessageRow.created_at });

          let finalResponse: SalesEmployeeResponse | null = null;
          let interrupted = false;
          try {
            for await (const chunk of streamSalesEmployee(
              supabase,
              business.businessId,
              conversation.id,
              business.businessName,
              business.businessProfile,
              message,
              history,
              business.language,
              { recommendProductsEnabled: business.recommendProductsEnabled, appointmentsEnabled: business.appointmentsEnabled },
              timer,
              quota,
              abortController.signal,
            )) {
              if (chunk.kind === "delta") {
                emit({ type: "delta", text: chunk.text });
              } else {
                finalResponse = chunk.response;
                interrupted = chunk.interrupted;
              }
            }
          } catch (error) {
            logAndGetUserMessage(error);
            interrupted = true;
            emit({ type: "error", kind: "failure" });
          }

          // Persist first (so the final event can carry the assistant
          // message's own timestamp as the poll cursor, exactly like the
          // JSON path -- otherwise a later poll would re-surface the
          // just-streamed reply as a duplicate). The prospect has already
          // received every delta, so this is off their critical path.
          try {
            if (finalResponse) {
              const assistantMessageRow = await writeAssistantMessage(finalResponse, interrupted);
              if (!interrupted) {
                emit({
                  type: "final",
                  escalate: finalResponse.escalate,
                  recommendedProducts: finalResponse.recommendedProducts,
                  asOf: assistantMessageRow.created_at,
                });
              }
              await finalizeTurnSideEffects(finalResponse, interrupted);
            }
          } catch (error) {
            logAndGetUserMessage(error);
          }

          request.signal.removeEventListener("abort", onClientAbort);
          try {
            controller.close();
          } catch {
            // Already closed/cancelled -- nothing to do.
          }
        },
        cancel() {
          // The client went away; unwind the generator promptly.
          request.signal.removeEventListener("abort", onClientAbort);
          abortController.abort();
        },
      });

      return new Response(sseStream, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": CHAT_STREAM_CONTENT_TYPE,
          // Belt and braces against any buffering proxy: no transform, and
          // the nginx/Vercel hint to flush each chunk straight through.
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let response;
    try {
      response = await askSalesEmployee(
        supabase,
        business.businessId,
        conversation.id,
        business.businessName,
        business.businessProfile,
        message,
        history,
        business.language,
        { recommendProductsEnabled: business.recommendProductsEnabled, appointmentsEnabled: business.appointmentsEnabled },
        timer,
        quota,
      );
    } catch (error) {
      const userMessage = logAndGetUserMessage(error);
      return withCors(jsonError(userMessage, 500));
    }

    const assistantMessageRow = await writeAssistantMessage(response, false);
    await finalizeTurnSideEffects(response, false);

    return withCors(
      jsonSuccess({
        conversationId: conversation.id,
        answer: response.answer,
        escalate: response.escalate,
        control: conversation.control,
        asOf: assistantMessageRow.created_at,
        recommendedProducts: response.recommendedProducts,
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
