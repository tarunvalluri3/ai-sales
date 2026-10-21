import "server-only";

/**
 * Per-stage wall-clock timing for one AI chat turn.
 *
 * Why this exists at all: before 2026-10-21 the only latency number this
 * project recorded was `ai_response_metrics.latency_ms`, whose clock
 * started *after* the quota check, the cache read, the question's
 * embedding call and the vector search had already run -- so it
 * understated the prospect's real wait, and said nothing about which part
 * of the turn was slow. The Vercel Hobby plan keeps 30 minutes of function
 * logs, so logging the breakdown and reading it later is not an option:
 * these numbers have to be persisted (see lib/ai-response-metrics.ts).
 *
 * Deliberately dumb: a monotonic-ish start stamp plus an ordered list of
 * {stage, ms}. No singleton, no async context -- the timer is created at
 * the real start of the turn by whoever owns the request
 * (app/api/chat/route.ts) and passed down, so there is exactly one clock
 * per turn and no ambiguity about when it started. A caller that does not
 * pass one (the WhatsApp/Instagram webhooks, the dashboard sandbox) gets a
 * timer that starts inside askSalesEmployee() instead, which is correct
 * for those paths: they have no widget response for a prospect to wait on.
 */
export type StageTiming = {
  /** Stable, low-cardinality stage name -- never prospect content. */
  stage: string;
  ms: number;
  /**
   * For a tool batch: which tools ran in it. The one thing the old
   * `tool_call_count` integer could not answer was *which* tool, which is
   * exactly what the duplicated-retrieval question needed (STATE.md,
   * 2026-10-21): a turn that calls search_knowledge_base after the upfront
   * vector search already ran is paying for the same retrieval twice.
   */
  tools?: string[];
};

export class TurnTimer {
  private readonly startedAtMs: number;
  private readonly stages: StageTiming[] = [];

  constructor(startedAtMs: number = Date.now()) {
    this.startedAtMs = startedAtMs;
  }

  /**
   * Runs `work`, records how long it took under `stage`, and returns its
   * result. Records on the failure path too (try/finally): a stage that
   * threw after 20 seconds is the single most useful thing to be able to
   * see, so it must not be the one case that records nothing.
   */
  async time<T>(stage: string, work: () => Promise<T>, tools?: string[]): Promise<T> {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      this.record(stage, Date.now() - startedAt, tools);
    }
  }

  record(stage: string, ms: number, tools?: string[]): void {
    this.stages.push(tools === undefined ? { stage, ms } : { stage, ms, tools });
  }

  /** Milliseconds since the start of the turn, not since the last stage. */
  elapsedMs(): number {
    return Date.now() - this.startedAtMs;
  }

  /** A copy, in the order the stages ran. */
  toStageTimings(): StageTiming[] {
    return [...this.stages];
  }
}
