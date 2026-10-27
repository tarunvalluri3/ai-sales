import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/logger";
import type { StageTiming } from "@/lib/turn-timings";
import type { TurnTimer } from "@/lib/turn-timings";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * The two writes to `public.ai_response_metrics`, kept out of lib/rag.ts
 * so the AI orchestration module does not also own this table's access
 * (AGENTS.md §9).
 *
 * Both are **best-effort**, which is the contract this table has always
 * had: a metrics-write failure must never break a real chat reply, so
 * nothing here throws or rejects -- a failure is logged at error level
 * (and so reaches Sentry via lib/logger.ts) and that is all.
 */

export type TurnMetrics = {
  businessId: string;
  conversationId: string;
  /**
   * Unchanged in meaning from Phase 21: wall-clock across the Gemini
   * calls this turn made, clocked from just before the first one. Kept
   * exactly as it was because `lib/analytics.ts` averages it on
   * /dashboard/analytics and `lib/usage-limit.ts` reads this table --
   * silently redefining the column would rewrite the dashboard's own
   * history. The true end-to-end figure is `total_latency_ms`, a
   * separate value, not a redefinition of this one.
   */
  latencyMs: number;
  /**
   * The prospect's real wait: from the start of the turn (the request
   * handler's first line, when the caller passes its own TurnTimer) to
   * the end of it. Always >= latencyMs.
   */
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * Gemini's thinking tokens, derived as total - input - output, because
   * `usage_metadata.output_tokens` from @langchain/google-genai maps to
   * `candidatesTokenCount`, which excludes them
   * (node_modules/@langchain/google-genai/dist/utils/common.js) -- so
   * before this, thinking time was spent, billed, and invisible. 0 is a
   * real measurement ("no thinking happened"), not missing data.
   */
  thinkingTokens: number;
  /** Business tools only -- never the send_reply tool. See lib/rag.ts. */
  toolCallCount: number;
  stageTimings: StageTiming[];
};

/**
 * Inserts the turn's row and returns its id, or null if the write failed.
 * The id is only needed so the request handler can append the stages that
 * happen after this point (finalizeTurnMetrics below).
 */
export async function insertTurnMetrics(
  supabase: SupabaseClient,
  metrics: TurnMetrics,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_response_metrics")
    .insert({
      business_id: metrics.businessId,
      conversation_id: metrics.conversationId,
      latency_ms: metrics.latencyMs,
      total_latency_ms: metrics.totalLatencyMs,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      thinking_tokens: metrics.thinkingTokens,
      tool_call_count: metrics.toolCallCount,
      stage_timings: metrics.stageTimings,
    })
    .select("id")
    .single();

  if (error || !data) {
    logEvent(
      "ai_response_metrics_write_failed",
      metrics.businessId,
      { conversationId: metrics.conversationId },
      "error",
    );
    return null;
  }
  return data.id;
}

/**
 * Rewrites `stage_timings` and `total_latency_ms` on an already-inserted
 * row with everything the turn did, including the stages that only happen
 * after the row exists -- the assistant message write, the escalation
 * handling, and the metrics insert itself. The turn's prospect-visible
 * wait does not end until the response is actually serialized, so
 * stopping the clock at the insert would understate it, which is the
 * exact flaw being fixed here.
 *
 * `timer` holds every stage of the turn (the handler's and the AI
 * pipeline's share one timer), so this overwrites rather than merges.
 *
 * Call this from `after()` -- it must never add a round trip to the
 * prospect's own wait.
 */
export async function finalizeTurnMetrics(
  supabase: SupabaseClient,
  metricsRowId: string | null,
  businessId: string,
  timer: TurnTimer,
): Promise<void> {
  if (!metricsRowId) return;
  const { error } = await supabase
    .from("ai_response_metrics")
    .update({ total_latency_ms: timer.elapsedMs(), stage_timings: timer.toStageTimings() })
    .eq("id", metricsRowId)
    .eq("business_id", businessId);
  if (error) {
    logEvent("ai_response_metrics_finalize_failed", businessId, { metricsRowId }, "error");
  }
}

/**
 * Part B (STATE.md 2026-10-28): the metrics row used to be inserted INSIDE the
 * reply path (stage `metrics_write`, ~75-180ms) and then rewritten a second
 * time from `after()`. A caller that can run `after()` (the widget route) now
 * asks for the write to be deferred: the row's id is generated here, the reply
 * goes out at once, and ONE insert -- carrying the final stage timings -- runs
 * after the response. Callers without `after()` (WhatsApp, Instagram, the
 * sandbox) keep the inline insert, so every real AI turn still writes exactly
 * one row, which is what the reply quota counts.
 */
export type DeferredTurnMetrics = { id: string; metrics: TurnMetrics };

export async function recordTurnMetrics(
  supabase: SupabaseClient,
  timer: TurnTimer,
  defer: boolean,
  metrics: Omit<TurnMetrics, "totalLatencyMs" | "stageTimings">,
): Promise<{ metricsRowId: string | null; metricsDraft: DeferredTurnMetrics | null }> {
  if (defer) {
    const id = crypto.randomUUID();
    return {
      metricsRowId: id,
      metricsDraft: { id, metrics: { ...metrics, totalLatencyMs: timer.elapsedMs(), stageTimings: timer.toStageTimings() } },
    };
  }
  const metricsRowId = await timer.time("metrics_write", () =>
    insertTurnMetrics(supabase, { ...metrics, totalLatencyMs: timer.elapsedMs(), stageTimings: timer.toStageTimings() }),
  );
  return { metricsRowId, metricsDraft: null };
}

/** Run from `after()`: inserts the deferred row with the turn's final timings. Best effort, like every write to this table. */
export async function writeDeferredTurnMetrics(
  supabase: SupabaseClient,
  draft: DeferredTurnMetrics,
  timer: TurnTimer,
): Promise<void> {
  const { metrics } = draft;
  const { error } = await supabase.from("ai_response_metrics").insert({
    id: draft.id,
    business_id: metrics.businessId,
    conversation_id: metrics.conversationId,
    latency_ms: metrics.latencyMs,
    total_latency_ms: timer.elapsedMs(),
    input_tokens: metrics.inputTokens,
    output_tokens: metrics.outputTokens,
    thinking_tokens: metrics.thinkingTokens,
    tool_call_count: metrics.toolCallCount,
    stage_timings: timer.toStageTimings(),
  });
  if (error) {
    logEvent("ai_response_metrics_write_failed", metrics.businessId, { conversationId: metrics.conversationId }, "error");
  }
}
