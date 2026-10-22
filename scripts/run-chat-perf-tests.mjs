// Unit tests for the chat-pipeline latency pass (STATE.md, 2026-10-22):
// the search-dedupe guard (lib/chat-query-dedupe.ts) and the deadline
// ordering invariants (lib/chat-timeouts.ts). Node's built-in test runner +
// assert, same approach as scripts/run-plan-tax-tests.mjs. Both modules are
// pure (no server-only, no I/O), so they import directly through the same
// @/* alias resolver the other suites use.
//
// Run: npm run test:chat-perf
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { normalizeQuery, querySimilarity, isRedundantSearch, REDUNDANT_SEARCH_SIMILARITY_THRESHOLD } = await import(
  new URL("../lib/chat-query-dedupe.ts", import.meta.url).href
);
const { CHAT_SERVER_MAX_DURATION_SECONDS, CHAT_AI_DEADLINE_MS, CHAT_MODEL_CALL_TIMEOUT_MS, CHAT_TOOL_TIMEOUT_MS } =
  await import(new URL("../lib/chat-timeouts.ts", import.meta.url).href);

test("normalizeQuery lowercases, strips punctuation, collapses whitespace", () => {
  assert.equal(normalizeQuery("  What's   your Return-Policy?? "), "what s your return policy");
  assert.equal(normalizeQuery("RETURN policy"), "return policy");
});

test("querySimilarity is order-insensitive and 1.0 for identical token sets", () => {
  assert.equal(querySimilarity("sofa pricing", "pricing sofa"), 1);
  assert.equal(querySimilarity("return policy", "Return Policy!"), 1);
});

test("querySimilarity drops sharply when a content word changes", () => {
  // {sofa,pricing} vs {sofa,warranty} -> 1 shared / 3 union
  assert.ok(querySimilarity("sofa pricing", "sofa warranty") < 0.5);
  assert.equal(querySimilarity("", "anything"), 0);
});

test("isRedundantSearch blocks an exact repeat of the prospect's own question", () => {
  const prior = ["What is your return policy?"];
  assert.equal(isRedundantSearch("what is your return policy", prior), true);
  assert.equal(isRedundantSearch("WHAT IS YOUR RETURN POLICY?!", prior), true);
});

test("isRedundantSearch allows a materially different reformulation", () => {
  const prior = ["do you offer same-day delivery"];
  // different topic entirely
  assert.equal(isRedundantSearch("what is your refund window", prior), false);
  // a broader/different category keeps enough distinct tokens to pass
  assert.equal(isRedundantSearch("shipping costs to remote areas", prior), false);
});

test("isRedundantSearch never blocks the first search of a turn (seed = question only) when query differs", () => {
  assert.equal(isRedundantSearch("warranty terms for electronics", ["my laptop screen is flickering"]), false);
});

test("isRedundantSearch ignores empty/whitespace candidates and empty prior lists", () => {
  assert.equal(isRedundantSearch("   ", ["anything"]), false);
  assert.equal(isRedundantSearch("anything", []), false);
});

test("the dedupe threshold is high enough to catch only near-duplicates", () => {
  assert.ok(REDUNDANT_SEARCH_SIMILARITY_THRESHOLD >= 0.85);
  assert.ok(REDUNDANT_SEARCH_SIMILARITY_THRESHOLD <= 1);
});

test("deadline ordering: AI deadline < server function limit, model/tool timeouts < AI deadline", () => {
  const serverMs = CHAT_SERVER_MAX_DURATION_SECONDS * 1000;
  assert.ok(CHAT_AI_DEADLINE_MS > 0 && CHAT_AI_DEADLINE_MS < serverMs, "AI deadline must sit inside the function limit");
  assert.ok(CHAT_MODEL_CALL_TIMEOUT_MS > 0 && CHAT_MODEL_CALL_TIMEOUT_MS < CHAT_AI_DEADLINE_MS, "a single model call must not be allowed to eat the whole budget");
  assert.ok(CHAT_TOOL_TIMEOUT_MS > 0 && CHAT_TOOL_TIMEOUT_MS < CHAT_AI_DEADLINE_MS, "a single tool must not be allowed to eat the whole budget");
});
