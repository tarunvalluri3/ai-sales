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

export type GuardrailCheck = "injection" | "abuse" | "output_contacts" | "output_promise";

// Typed as Record<..., GuardrailMode> (not `as const`) on purpose: flipping a value
// to "enforce" must type-check at every `=== "enforce"` branch, not be narrowed away.
export const GUARDRAIL_MODES: Record<GuardrailCheck, GuardrailMode> = {
  injection: "log_only",
  abuse: "log_only",
  // Output checks (guardrails Phase 4). A link, email or phone number in a reply
  // that appears nowhere in this turn's evidence is removed; an affirmative
  // discount/refund/guarantee/free promise with no support in the business's
  // data swaps the reply for the safe one. Both log-only until reviewed.
  // NOT listed here because they enforce from day one: the canary-leak and
  // verbatim-prompt-leak block (lib/guardrails/output-check.ts detectLeak).
  output_contacts: "log_only",
  output_promise: "log_only",
};

