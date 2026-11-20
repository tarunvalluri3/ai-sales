/**
 * Widget reliability item 1, owner adjustment 4 (STATE.md 2026-11-20): a
 * streamed turn no longer makes the visitor wait for the parallel metadata
 * call (the model's own judgement of escalate / usedContext). The server waits
 * at most STREAM_METADATA_GRACE_MS after the visible answer is complete; if the
 * call is slower, the terminal event goes out with the conservative defaults
 * and the call finishes in the background. Its result is then still applied
 * the same way finalizeTurnSideEffects applies it -- so a "talk to a person"
 * or complaint turn always ends up flagged in the inbox, however slow the
 * metadata call was.
 *
 * Pure: no Next/Supabase import. The route injects the real escalation and
 * unanswered-question writers; the tests inject fakes.
 */

export type TurnJudgement = {
  usedContext: boolean;
  escalate: boolean;
  escalationReason: string | null;
};

export type GraceResult<T> = { settled: true; value: T } | { settled: false; pending: Promise<T> };

/**
 * Waits for `promise` for at most `graceMs`. Never rejects: the caller passes a
 * promise that already maps its own failure to a value (e.g. null).
 */
export async function settleWithinGrace<T>(promise: Promise<T>, graceMs: number): Promise<GraceResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = Symbol("late");
  const timeout = new Promise<typeof late>((resolve) => {
    timer = setTimeout(() => resolve(late), graceMs);
  });
  try {
    const winner = await Promise.race([promise, timeout]);
    if (winner === late) return { settled: false, pending: promise };
    return { settled: true, value: winner as T };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type LateJudgementDeps = {
  /** The turn already escalated (e.g. the output guard replaced the reply), so the flag/notification already ran. */
  alreadyEscalated: boolean;
  /** The prospect's message was flagged by the input classifier -- never a knowledge gap. */
  flaggedByGuardrails: boolean;
  /** Retrieval found documents for this turn (`grounded` = documents && usedContext). */
  hadDocuments: boolean;
  /** Flag the conversation for a human + notification + workflow (the route's own escalation path). */
  escalate: (reason: string | null) => Promise<void>;
  /** Record the question in "top unanswered questions". */
  recordUnanswered: () => Promise<void>;
  log: (event: "ai_stream_metadata_late_applied" | "ai_stream_metadata_failed", fields: Record<string, unknown>) => void;
};

export type LateJudgementOutcome = "escalated" | "unanswered_logged" | "nothing" | "failed";

/** Applies a judgement that arrived after the terminal event. */
export async function applyLateJudgement(
  pending: Promise<TurnJudgement | null>,
  deps: LateJudgementDeps,
): Promise<LateJudgementOutcome> {
  let judgement: TurnJudgement | null;
  try {
    judgement = await pending;
  } catch {
    judgement = null;
  }
  if (!judgement) {
    deps.log("ai_stream_metadata_failed", { late: true });
    return "failed";
  }
  deps.log("ai_stream_metadata_late_applied", { escalate: judgement.escalate, usedContext: judgement.usedContext });
  if (judgement.escalate) {
    if (deps.alreadyEscalated) return "nothing";
    await deps.escalate(judgement.escalationReason);
    return "escalated";
  }
  const grounded = deps.hadDocuments && judgement.usedContext;
  if (!grounded && !deps.alreadyEscalated && !deps.flaggedByGuardrails) {
    await deps.recordUnanswered();
    return "unanswered_logged";
  }
  return "nothing";
}
