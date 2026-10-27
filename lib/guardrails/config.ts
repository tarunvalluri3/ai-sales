/**
 * Rollout mode per guardrail check (guardrails programme, STATE.md). Same
 * idea as Phase 32's LOG_ONLY_SCOPES in lib/abuse-limits.ts: a check starts
 * in "log_only" -- it records what it WOULD have done and changes nothing --
 * and moving it to "enforce" after reviewing the recorded signals is a
 * one-line change here.
 *
 * Not in this table because they enforce from day one, by decision: masking
 * of sensitive numbers, input sanitising and the length cap (lib/guardrails/
 * sanitize.ts, mask.ts), the canary-leak block and the write-tool caps
 * (later phases). Everything below is a heuristic whose false-positive rate
 * is not yet known.
 *
 * What "enforce" does for the classifier checks is the Phase 5 response path
 * (fixed safe reply + needs_attention + handoff); until that exists this
 * table only labels recorded events, so flipping a value early changes the
 * `mode` stored on new rows and nothing else.
 */
export type GuardrailMode = "log_only" | "enforce";

export const GUARDRAIL_MODES = {
  injection: "log_only",
  abuse: "log_only",
} as const satisfies Record<string, GuardrailMode>;

export type GuardrailCheck = keyof typeof GUARDRAIL_MODES;
