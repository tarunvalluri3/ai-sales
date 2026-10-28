/**
 * Phase 33 (docs/phases.md), approved amendment 7: Gemini pricing kept in a
 * versioned config with `effectiveFrom`, not hardcoded inline in whatever
 * queries the AI Usage & Costs page -- a past month's cost must still be
 * computed with the price that was actually in effect that month, even
 * after a future price change is added here.
 *
 * NOT "server-only": this is pure data/math, no I/O, so it is importable
 * by a plain Node script the same way lib/plans.ts and
 * lib/copilot-lifecycle.ts already are (no test harness exists for this
 * yet, but nothing here should need one that a plain script couldn't run).
 *
 * PRICING SOURCE / CONFIDENCE -- read before trusting a real dollar
 * figure this produces: these rates were taken from third-party LLM
 * pricing aggregators during this phase's build (no live fetch of
 * https://ai.google.dev/gemini-api/docs/pricing was done), because the
 * aggregators disagreed with each other on gemini-3.1-flash-lite's exact
 * rate. Before this page is used for a real margin decision, confirm
 * every row below against Google's own pricing page and update
 * `source` if it changes. `gemini-embedding-2-preview` has NO published
 * price anywhere found -- it is deliberately left out of PRICING below
 * rather than guessed, and lib/ai-usage-cost.ts treats any model with no
 * matching entry as "unpriced" (flagged, excluded from the cost total)
 * rather than silently costing it $0.
 */

export type GeminiModelPricing = {
  model: string;
  /** USD per 1,000,000 input/prompt tokens. */
  inputPerMillionUsd: number;
  /** USD per 1,000,000 output/candidates tokens. Embedding models bill no output. */
  outputPerMillionUsd: number;
  /** ISO date this rate took effect. A model can appear more than once, at different effectiveFrom dates, once a price change is recorded here. */
  effectiveFrom: string;
  /** Where this number came from, for the next person to re-verify it. */
  source: string;
};

export const GEMINI_PRICING: readonly GeminiModelPricing[] = [
  {
    model: "gemini-3.1-flash-lite",
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 1.5,
    effectiveFrom: "2026-11-02",
    source: "Third-party aggregator consensus (llmreference.com, Requesty, BenchLM citing Google's pricing page), captured 2026-11-02. NOT independently confirmed against ai.google.dev -- verify before relying on this for a real finance decision.",
  },
  {
    model: "gemini-embedding-001",
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0,
    effectiveFrom: "2026-11-02",
    source: "Google's gemini-embedding-001 GA announcement (developers.googleblog.com, 2025-07-14): $0.15 / 1M input tokens, no output billing.",
  },
] as const;

/**
 * The rate in effect for `model` at `atIso` (default now) -- the latest
 * entry whose `effectiveFrom` is on or before that date. Returns `null`
 * for a model with no pricing entry at all (e.g.
 * gemini-embedding-2-preview) -- the caller must treat that as "unpriced",
 * never fall back to a guess.
 */
export function resolveGeminiPricing(model: string, atIso: string = new Date().toISOString()): GeminiModelPricing | null {
  const candidates = GEMINI_PRICING.filter((p) => p.model === model && p.effectiveFrom <= atIso);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, p) => (p.effectiveFrom > latest.effectiveFrom ? p : latest));
}

/** USD cost for one Gemini call, or `null` if the model is unpriced (never fabricated as $0). */
export function estimateCallCostUsd(
  model: string,
  promptTokens: number | null,
  candidatesTokens: number | null,
  atIso?: string,
): number | null {
  const pricing = resolveGeminiPricing(model, atIso);
  if (!pricing) return null;
  const inputCost = ((promptTokens ?? 0) / 1_000_000) * pricing.inputPerMillionUsd;
  const outputCost = ((candidatesTokens ?? 0) / 1_000_000) * pricing.outputPerMillionUsd;
  return inputCost + outputCost;
}

/**
 * Approximate USD->INR conversion for the margin-vs-revenue comparison
 * (AI Usage & Costs, per-tenant gross margin). Gemini bills in USD;
 * tenant revenue (lib/plans.ts) is in INR paise. This is a single,
 * explicit, dated assumption -- not a live FX feed -- re-confirm
 * periodically; it never affects what a tenant is charged, only how this
 * internal admin page displays a cost comparison.
 */
export const USD_TO_INR_RATE = 89;
export const USD_TO_INR_RATE_EFFECTIVE_FROM = "2026-11-02";
