// Failed-reply handling tests (production readiness item 2; LAUNCH_AUDIT.md
// §1, §12, §13, blocker B4).
//
//   1. BEHAVIOURAL (mocks, no network):
//      - classifyGeminiError: every Gemini error kind, including ones wrapped
//        in an AppError-style `cause` chain, not only timeouts;
//      - the LangChain retry bound (default 1, capped at 3, never the 6 default);
//      - runReplyWithFallback, the orchestration both webhooks use: success,
//        a Gemini error before the reply (fallback sent + failed), an error
//        AFTER the reply was queued (no second message), a fallback that
//        itself fails, and a report step that throws;
//      - decideRecovery, the sweep's decision for a stuck inbound message.
//   2. STRUCTURAL: both webhooks write the dedup row (reply_status 'pending')
//      before any reply, so a Meta redelivery can never produce a duplicate;
//      the reply runs through runReplyWithFallback; WhatsApp replies after the
//      200; getChatModel sets maxRetries; the sweep is scheduled.
//
// Run: npm run test:reply-failure
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { classifyGeminiError, isTransientGeminiError } = await import(new URL("../lib/gemini-errors.ts", import.meta.url).href);
const { boundedRetries, CHAT_MODEL_MAX_RETRIES, CHAT_MODEL_MAX_RETRIES_CEILING } = await import(
  new URL("../lib/chat-timeouts.ts", import.meta.url).href
);
const rules = await import(new URL("../lib/channel-reply-rules.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

function httpError(status, message = "boom") {
  return Object.assign(new Error(message), { status });
}
/** Same shape as lib/errors.ts AppError: the provider error is in `cause`. */
function wrapped(cause) {
  return Object.assign(new Error("askSalesEmployee: chat generation failed"), { name: "AppError", cause });
}

// ------------------------------------------------------------- classifier

test("classifyGeminiError: timeouts and aborts", () => {
  assert.equal(classifyGeminiError(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
  assert.equal(classifyGeminiError(Object.assign(new Error("x"), { name: "AbortError" })), "timeout");
});

test("classifyGeminiError: HTTP statuses, directly and through an AppError cause chain", () => {
  assert.equal(classifyGeminiError(httpError(429)), "rate_limited");
  assert.equal(classifyGeminiError(wrapped(httpError(429))), "rate_limited");
  assert.equal(classifyGeminiError(wrapped(httpError(503))), "unavailable");
  assert.equal(classifyGeminiError(httpError(500)), "unavailable");
  assert.equal(classifyGeminiError(httpError(401)), "auth");
  assert.equal(classifyGeminiError(httpError(403)), "auth");
  assert.equal(classifyGeminiError(httpError(400, "INVALID_ARGUMENT: bad schema")), "invalid_request");
  assert.equal(classifyGeminiError(httpError(400, "Response was blocked due to SAFETY")), "blocked");
  assert.equal(classifyGeminiError({ response: { status: 502 } }), "unavailable");
});

test("classifyGeminiError: provider messages without a status", () => {
  assert.equal(classifyGeminiError(new Error("[GoogleGenerativeAI Error]: RESOURCE_EXHAUSTED quota")), "rate_limited");
  assert.equal(classifyGeminiError(new Error("The model is overloaded. Please try again later.")), "unavailable");
  assert.equal(classifyGeminiError(new Error("API key not valid. Please pass a valid API key.")), "auth");
  assert.equal(classifyGeminiError(new Error("Candidate was blocked due to SAFETY")), "blocked");
  assert.equal(classifyGeminiError(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } })), "network");
  assert.equal(classifyGeminiError(new Error("something odd")), "unknown");
  assert.equal(classifyGeminiError(null), "unknown");
  assert.equal(classifyGeminiError("a string"), "unknown");
});

test("classifyGeminiError: a long cause chain is bounded (no infinite loop on a cycle)", () => {
  const a = new Error("a");
  const b = Object.assign(new Error("b"), { cause: a });
  a.cause = b;
  assert.equal(classifyGeminiError(a), "unknown");
});

test("transient kinds", () => {
  for (const kind of ["timeout", "rate_limited", "unavailable", "network"]) assert.equal(isTransientGeminiError(kind), true);
  for (const kind of ["auth", "invalid_request", "blocked", "unknown"]) assert.equal(isTransientGeminiError(kind), false);
});

// ---------------------------------------------------------- retry bound

test("LangChain retries: default 1, bounded 0..3, never the library default of 6", () => {
  assert.equal(CHAT_MODEL_MAX_RETRIES, 1);
  assert.equal(CHAT_MODEL_MAX_RETRIES_CEILING, 3);
  assert.equal(boundedRetries(undefined, 1), 1);
  assert.equal(boundedRetries("", 1), 1);
  assert.equal(boundedRetries("0", 1), 0);
  assert.equal(boundedRetries("2", 1), 2);
  assert.equal(boundedRetries("6", 1), 3);
  assert.equal(boundedRetries("-1", 1), 1);
  assert.equal(boundedRetries("abc", 1), 1);
});

test("getChatModel passes maxRetries to LangChain", () => {
  const rag = read("lib/rag.ts");
  const body = rag.slice(rag.indexOf("export function getChatModel()"), rag.indexOf("export function getChatModel()") + 900);
  assert.match(body, /maxRetries: CHAT_MODEL_MAX_RETRIES/);
});

// ----------------------------------------------------- orchestration

function harness({ answer, reportThrows = false, fallbackThrows = false }) {
  const calls = { report: [], fallback: 0, status: [], fallbackErrors: 0 };
  const deps = {
    answer,
    reportFailure: async (error, state) => {
      calls.report.push({ error, replyQueued: state.replyQueued });
      if (reportThrows) throw new Error("sentry down");
    },
    sendFallback: async () => {
      calls.fallback++;
      if (fallbackThrows) throw new Error("meta down");
    },
    markStatus: async (status) => calls.status.push(status),
    onFallbackError: () => calls.fallbackErrors++,
  };
  return { deps, calls };
}

test("orchestration: a normal reply is marked replied; nothing reported, no fallback", async () => {
  const { deps, calls } = harness({
    answer: async (state) => {
      state.replyQueued = true;
      return "replied";
    },
  });
  const result = await rules.runReplyWithFallback(deps);
  assert.deepEqual(result, { status: "replied", fallbackSent: false });
  assert.deepEqual(calls.status, ["replied"]);
  assert.equal(calls.report.length, 0);
  assert.equal(calls.fallback, 0);
});

test("orchestration: a deliberate no-reply (human control, not serving) is marked skipped", async () => {
  const { deps, calls } = harness({ answer: async () => "skipped" });
  assert.equal((await rules.runReplyWithFallback(deps)).status, "skipped");
  assert.deepEqual(calls.status, ["skipped"]);
});

for (const [label, error] of [
  ["Gemini 429", wrapped(httpError(429))],
  ["Gemini 503", wrapped(httpError(503))],
  ["Gemini auth error", httpError(403)],
  ["a database error", Object.assign(new Error("insert failed"), { code: "23502" })],
]) {
  test(`orchestration: ${label} before the reply -> reported, fallback sent once, marked failed`, async () => {
    const { deps, calls } = harness({
      answer: async () => {
        throw error;
      },
    });
    const result = await rules.runReplyWithFallback(deps);
    assert.deepEqual(result, { status: "failed", fallbackSent: true });
    assert.equal(calls.report.length, 1);
    assert.equal(calls.report[0].error, error);
    assert.equal(calls.fallback, 1);
    assert.deepEqual(calls.status, ["failed"]);
  });
}

test("orchestration: a failure AFTER the reply was queued sends no second message", async () => {
  const { deps, calls } = harness({
    answer: async (state) => {
      state.replyQueued = true;
      throw new Error("usage reminder failed");
    },
  });
  const result = await rules.runReplyWithFallback(deps);
  assert.deepEqual(result, { status: "failed", fallbackSent: false });
  assert.equal(calls.report.length, 1, "still reported");
  assert.equal(calls.report[0].replyQueued, true);
  assert.equal(calls.fallback, 0, "no contradictory fallback");
});

test("orchestration: the fallback itself failing is logged and the row is still marked failed", async () => {
  const { deps, calls } = harness({ answer: async () => Promise.reject(httpError(500)), fallbackThrows: true });
  const result = await rules.runReplyWithFallback(deps);
  assert.deepEqual(result, { status: "failed", fallbackSent: false });
  assert.equal(calls.fallbackErrors, 1);
  assert.deepEqual(calls.status, ["failed"]);
});

test("orchestration: a broken reporter never stops the fallback", async () => {
  const { deps, calls } = harness({ answer: async () => Promise.reject(httpError(503)), reportThrows: true });
  const result = await rules.runReplyWithFallback(deps);
  assert.equal(result.fallbackSent, true);
  assert.equal(calls.fallback, 1);
});

test("orchestration never throws, even if the status write throws", async () => {
  const result = await rules.runReplyWithFallback({
    answer: async () => Promise.reject(new Error("x")),
    reportFailure: async () => {},
    sendFallback: async () => {},
    markStatus: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(result.status, "failed");
});

test("the fallback is fixed, honest and distinct from the timeout/quota messages", () => {
  const rag = read("lib/rag.ts");
  assert.match(rules.REPLY_FAILED_FALLBACK_MESSAGE, /our team/);
  assert.ok(!rag.includes(rules.REPLY_FAILED_FALLBACK_MESSAGE), "not the same text as another canned message");
});

// --------------------------------------------------------- recovery

test("recovery decisions", () => {
  const d = rules.decideRecovery;
  assert.equal(d({ conversationExists: false, control: null, replyAfterInbound: false }), "no_conversation");
  assert.equal(d({ conversationExists: true, control: "ai", replyAfterInbound: true }), "already_replied");
  assert.equal(d({ conversationExists: true, control: "human", replyAfterInbound: true }), "already_replied");
  assert.equal(d({ conversationExists: true, control: "human", replyAfterInbound: false }), "human_control");
  assert.equal(d({ conversationExists: true, control: "ai", replyAfterInbound: false }), "send_fallback");
});

test("the recovery sweep never re-runs the AI and is scheduled", () => {
  const sweep = read("lib/inbound-reply-recovery.ts");
  assert.doesNotMatch(sweep, /askSalesEmployee|streamSalesEmployee/);
  assert.match(sweep, /claim_stuck_inbound_replies/);
  const scheduled = [read("app/api/cron/process-ingestion-queue/route.ts"), safeRead("lib/scheduler/jobs.ts")].join("\n");
  assert.match(scheduled, /recoverStuckInboundReplies/);
});

function safeRead(relative) {
  try {
    return read(relative);
  } catch {
    return "";
  }
}

// --------------------------------------------------------- structural

for (const [channel, file, column] of [
  ["whatsapp", "app/api/webhooks/whatsapp/route.ts", "whatsapp_message_id"],
  ["instagram", "app/api/meta/instagram/webhook/route.ts", "instagram_message_id"],
]) {
  test(`${channel}: the dedup row (reply_status pending) is written before any reply, and a duplicate returns early`, () => {
    const source = read(file);
    const dedup = source.indexOf(`${column}: `);
    assert.ok(dedup > 0);
    assert.match(source.slice(dedup, dedup + 120), /reply_status: "pending"/);
    const afterDedup = source.slice(dedup, dedup + 900);
    assert.match(afterDedup, /if \(dedupError\) \{[\s\S]*?return null;/, "a redelivery stops before storing or replying");
    assert.ok(dedup < source.indexOf("await askSalesEmployee("));
    assert.ok(dedup < source.indexOf("await sendCannedReply("));
  });

  test(`${channel}: the reply runs through runReplyWithFallback with a real report, fallback and status`, () => {
    const source = read(file);
    assert.match(source, /runReplyWithFallback\(\{/);
    assert.match(source, /reportChannelReplyFailure\(\{[\s\S]*?channel: "\w+"[\s\S]*?stage: "ai_reply"/);
    assert.match(source, /sendFallback: /);
    assert.match(source, /markInboundReplyStatus\(supabase, "\w+", businessId, [\w.]+, status\)/);
    assert.match(source, /REPLY_FAILED_FALLBACK_MESSAGE/);
  });

  test(`${channel}: replyQueued is set right after every send, so a later failure sends no fallback`, () => {
    const source = read(file);
    const start = source.indexOf("async function answerInboundMessage(");
    const end = source.indexOf("\nasync function ", start + 10);
    const body = source.slice(start, end);
    const sends = [...body.matchAll(/await send(?:Canned)?Reply\([\s\S]*?\);/g)];
    assert.equal(sends.length, 3, `${channel}: the AI, non-text and guardrail sends`);
    for (const match of sends) {
      const next = body.slice(match.index + match[0].length, match.index + match[0].length + 80);
      assert.match(next, /^\s*state\.replyQueued = true;/, `${channel}: every send must be followed by replyQueued`);
    }
  });

  test(`${channel}: a rate-limited message is marked skipped (so the sweep never answers it)`, () => {
    const source = read(file);
    const limited = source.indexOf('{ scope: "conversation" }');
    assert.match(source.slice(limited, limited + 200), /markInboundReplyStatus\(supabase, "\w+", businessId, [\w.]+, "skipped"\)/);
  });
}

test("whatsapp: the AI reply runs after the 200 (in after()), like Instagram", () => {
  const source = read("app/api/webhooks/whatsapp/route.ts");
  assert.match(source, /after\(\(\) => replyToInboundMessage\(supabase, ingested\)\)/);
  const post = source.slice(source.indexOf("export async function POST"), source.indexOf("type IngestedWhatsappMessage"));
  assert.doesNotMatch(post, /askSalesEmployee/);
});

test("migration: reply tracking columns and a claim function customers cannot execute", () => {
  const sql = read("supabase/migrations/20261115000000_inbound_reply_tracking.sql");
  assert.match(sql, /alter table public\.whatsapp_inbound_messages\s+add column reply_status/);
  assert.match(sql, /alter table public\.instagram_inbound_messages\s+add column reply_status/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /revoke execute on function public\.claim_stuck_inbound_replies\(text, integer, integer, integer\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create table/i, "no new table (so no new RLS surface)");
});
