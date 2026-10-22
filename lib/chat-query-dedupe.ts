/**
 * A per-turn guard against the model re-running `search_knowledge_base`
 * with a query it has effectively already run this turn.
 *
 * Background (STATE.md, "AI reply latency", 2026-10-21): the passive
 * per-turn retrieval in `lib/rag.ts` already searches the business's full
 * knowledge base with the prospect's own message before the first model
 * call, and those passages are handed to the model inside
 * <retrieved_context>. Naming that query in the context tag took one
 * measured scenario from 4/4 redundant `search_knowledge_base` calls to
 * 0/4 -- but a residual remained: on some turns the model still re-issued a
 * search whose query is, in substance, one already answered, paying for a
 * second embedding round trip and a second vector search for passages it
 * had already been given.
 *
 * This module is the code-level backstop the latency entry's "Next" list
 * asked for. It is deliberately **pure** (no `server-only`, no I/O) so it
 * can be unit-tested directly (scripts/run-chat-perf-tests.mjs), and
 * deliberately **conservative**: it blocks only a near-identical repeat, so
 * a materially different reformulation -- a different topic, a broader
 * category, different terminology, which is exactly what the prompt asks
 * the model to try -- is never blocked. A guard that stopped a legitimately
 * different search would cost answer quality to save latency, which the
 * latency work is explicitly not allowed to do.
 */

/**
 * Lowercases, strips punctuation, and collapses whitespace so that only
 * genuine wording differences survive -- "What's your return policy?" and
 * "whats your return policy" normalize to the same string, but "return
 * policy" and "shipping policy" do not.
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/**
 * Jaccard similarity of the two queries' token sets (|A∩B| / |A∪B|), in
 * [0, 1]. Order-insensitive, so "sofa pricing" and "pricing sofa" score
 * 1.0, while "sofa pricing" and "sofa warranty" score 1/3.
 */
export function querySimilarity(a: string, b: string): number {
  const na = normalizeQuery(a);
  const nb = normalizeQuery(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  const sa = tokenSet(na);
  const sb = tokenSet(nb);
  let intersection = 0;
  for (const token of sa) {
    if (sb.has(token)) intersection += 1;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * The similarity at or above which a candidate counts as a near-duplicate.
 * High on purpose (0.9): at this threshold only an exact normalized match
 * or a pure reordering/punctuation variant is caught. Anything that adds,
 * drops, or swaps a content word falls below it and is allowed through.
 */
export const REDUNDANT_SEARCH_SIMILARITY_THRESHOLD = 0.9;

/**
 * True when `candidate` is, in substance, one of `priorQueries` already run
 * this turn. `priorQueries` is seeded in lib/rag.ts with the prospect's own
 * message (the query the passive retrieval already ran) and grows with each
 * `search_knowledge_base` query actually executed in the turn.
 *
 * Returns false for an empty/whitespace candidate (the tool's own schema
 * rejects that separately) and for an empty prior list, so the guard can
 * never block the first search of a turn.
 */
export function isRedundantSearch(candidate: string, priorQueries: readonly string[]): boolean {
  if (normalizeQuery(candidate).length === 0) return false;
  return priorQueries.some(
    (prior) => querySimilarity(candidate, prior) >= REDUNDANT_SEARCH_SIMILARITY_THRESHOLD,
  );
}
