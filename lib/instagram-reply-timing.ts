import type { StageTiming } from "@/lib/turn-timings";

/**
 * The one `ig_reply_timing` log line per Instagram reply (2026-11-02): where
 * the time goes between Meta's webhook POST and our own Send API call
 * returning. Pure, so it is unit-tested without Next, Supabase or Meta.
 *
 * Two kinds of numbers:
 *  - milestones (`*AtMs`): milliseconds since the webhook POST reached the
 *    handler, so the gaps between them read straight off the line;
 *  - stage durations (`*Ms`): summed from the turn's TurnTimer stages, the
 *    same names `ai_response_metrics.stage_timings` stores for the widget,
 *    so the two channels can be compared like for like.
 *
 * The Instagram path is non-streaming (Instagram cannot show partial
 * messages), so "LLM first output" is the end of the first model call:
 * `llmFirstCallMs`. Never carries message text, tokens or ids beyond the
 * conversation id.
 */
export type InstagramReplyMilestones = {
  signatureVerifiedAtMs: number;
  messageSavedAtMs: number | null;
  backgroundStartedAtMs: number | null;
  contextLoadedAtMs: number | null;
  llmCompleteAtMs: number | null;
  metaSendReturnedAtMs: number | null;
};

/** How the turn ended. `ai` = a model reply; `instant` = answer bank / cache / replay with no model call. */
export type InstagramReplyOutcome = "ai" | "instant" | "canned" | "not_serving" | "human_control" | "error";

export type InstagramReplyTimingInput = {
  conversationId: string;
  milestones: InstagramReplyMilestones;
  stages: StageTiming[];
  totalMs: number;
  model: string | null;
  outcome: InstagramReplyOutcome;
  /** null when no send was attempted. */
  sent: boolean | null;
  /**
   * Webhook arrival minus Meta's event timestamp: how long Meta took to tell
   * us about the DM. Outside our control and subject to clock skew, so it is
   * reported apart from `totalMs`. null when Meta sent no timestamp.
   */
  metaDeliveryLagMs: number | null;
};

export type InstagramReplyTimingLog = Record<string, string | number | boolean | null>;

function sumStages(stages: StageTiming[], match: (stage: string) => boolean): number {
  return stages.reduce((total, entry) => (match(entry.stage) ? total + entry.ms : total), 0);
}

function isModelCall(stage: string): boolean {
  return stage.startsWith("model_call_") || stage === "final_structured_call";
}

export function summarizeInstagramReplyTiming(input: InstagramReplyTimingInput): InstagramReplyTimingLog {
  const { stages, milestones } = input;
  const firstCall = stages.find((entry) => entry.stage === "model_call_1");
  return {
    conversationId: input.conversationId,
    outcome: input.outcome,
    model: input.model,
    sent: input.sent,
    totalMs: input.totalMs,
    metaDeliveryLagMs: input.metaDeliveryLagMs,
    signatureVerifiedAtMs: milestones.signatureVerifiedAtMs,
    messageSavedAtMs: milestones.messageSavedAtMs,
    backgroundStartedAtMs: milestones.backgroundStartedAtMs,
    contextLoadedAtMs: milestones.contextLoadedAtMs,
    llmCompleteAtMs: milestones.llmCompleteAtMs,
    metaSendReturnedAtMs: milestones.metaSendReturnedAtMs,
    embeddingPrefetchMs: sumStages(stages, (stage) => stage === "embedding_prefetch"),
    embeddingWaitMs: sumStages(stages, (stage) => stage === "embedding"),
    vectorSearchMs: sumStages(stages, (stage) => stage === "vector_search"),
    instantCheckMs: sumStages(stages, (stage) => stage === "instant_local" || stage === "faq_match"),
    cacheReadMs: sumStages(stages, (stage) => stage === "cache_read"),
    llmFirstCallMs: firstCall ? firstCall.ms : null,
    llmCalls: stages.filter((entry) => isModelCall(entry.stage)).length,
    llmMs: sumStages(stages, isModelCall),
    toolMs: sumStages(stages, (stage) => stage.startsWith("tool_batch_")),
    sendMs: sumStages(stages, (stage) => stage === "meta_send"),
  };
}
