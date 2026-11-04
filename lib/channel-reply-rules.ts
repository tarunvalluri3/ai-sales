/**
 * Pure rules shared by the WhatsApp and Instagram reply paths and the
 * recovery sweep (production readiness, item 2). No server-only import, so
 * the unit tests can import it directly.
 */

export type ReplyChannel = "whatsapp" | "instagram";

/** Matches the check constraint in migration 20261115000000. */
export type InboundReplyStatus = "pending" | "replied" | "skipped" | "failed" | "recovering" | "recovered";

/**
 * Sent to the prospect when the AI reply fails for any reason (Gemini error,
 * database error, anything). Honest and fixed -- never a guessed answer
 * (AGENTS.md §3 rule 4) -- and it promises only what actually happens: the
 * conversation is flagged for the team. Deliberately different wording from
 * RESPONSE_TIMEOUT_MESSAGE / USAGE_QUOTA_EXCEEDED_MESSAGE (lib/rag.ts).
 */
export const REPLY_FAILED_FALLBACK_MESSAGE =
  "Sorry, I couldn't answer that just now. I've passed your message to our team, and someone will get back to you shortly.";

/**
 * Whether the fallback should be sent after a failure. Only when no reply
 * has been queued yet: a failure in the follow-up work after the real reply
 * went out (metrics, usage reminder ...) must not also send "sorry, I couldn't
 * answer" -- that would be a second, contradictory message.
 */
export function shouldSendFallback(state: { replyQueued: boolean }): boolean {
  return !state.replyQueued;
}

/** Mutable per-turn state the reply path updates as it goes. */
export type ReplyAttemptState = { replyQueued: boolean; clerkOrgId: string | null };

export type ReplyRunDeps = {
  /** Produces and queues the reply. Sets state.replyQueued once a reply row exists. */
  answer: (state: ReplyAttemptState) => Promise<"replied" | "skipped">;
  /** Sentry + alertable event + flag the conversation. */
  reportFailure: (error: unknown, state: ReplyAttemptState) => Promise<void>;
  /** Stores and sends REPLY_FAILED_FALLBACK_MESSAGE on the channel. */
  sendFallback: () => Promise<void>;
  /** Writes the inbound row's reply_status. */
  markStatus: (status: InboundReplyStatus) => Promise<void>;
  onFallbackError?: (error: unknown) => void;
};

export type ReplyRunResult = { status: "replied" | "skipped" | "failed"; fallbackSent: boolean };

/**
 * The one orchestration every channel reply runs through (production
 * readiness, item 2). Never throws:
 *  - success -> the inbound row is marked replied/skipped;
 *  - ANY error from `answer` (every Gemini error, a DB error ...) -> reported,
 *    the fallback is sent only if no reply was queued yet, and the row is
 *    marked failed even if the report or the fallback itself fails.
 */
export async function runReplyWithFallback(deps: ReplyRunDeps): Promise<ReplyRunResult> {
  const state: ReplyAttemptState = { replyQueued: false, clerkOrgId: null };
  let status: ReplyRunResult["status"];
  let fallbackSent = false;
  try {
    status = await deps.answer(state);
  } catch (error) {
    status = "failed";
    try {
      await deps.reportFailure(error, state);
    } catch {
      // Reporting must never stop the prospect getting the fallback.
    }
    if (shouldSendFallback(state)) {
      try {
        await deps.sendFallback();
        fallbackSent = true;
      } catch (fallbackError) {
        deps.onFallbackError?.(fallbackError);
      }
    }
  }
  try {
    await deps.markStatus(status);
  } catch {
    // markInboundReplyStatus never throws; this is belt and braces.
  }
  return { status, fallbackSent };
}

/**
 * What the recovery sweep does with a claimed, stuck inbound message.
 *  - `already_replied`: a reply (AI, staff or system) exists after the inbound
 *    message, so the turn finished and only the status write was lost.
 *  - `human_control`: a human owns the thread; they will answer.
 *  - `no_conversation`: nothing to send to (conversation deleted).
 *  - `send_fallback`: the reply was lost -- send the fallback and flag it.
 */
export type RecoveryDecision = "already_replied" | "human_control" | "no_conversation" | "send_fallback";

export function decideRecovery(input: {
  conversationExists: boolean;
  control: "ai" | "human" | null;
  replyAfterInbound: boolean;
}): RecoveryDecision {
  if (!input.conversationExists) return "no_conversation";
  if (input.replyAfterInbound) return "already_replied";
  if (input.control === "human") return "human_control";
  return "send_fallback";
}
