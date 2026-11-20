// Widget reliability tests (STATE.md, 2026-11-20 -- the owner's live test of
// the production widget). Node's built-in test runner + assert, the same
// approach as scripts/run-chat-streaming-tests.mjs. No database, no Gemini,
// no network: the server's SSE turn builder and late-judgement logic are pure
// modules driven by fake generators; the widget's turn deadlines use a fake
// clock; and public/widget-loader.js itself runs inside a vm with a fake DOM
// (scripts/lib/widget-loader-harness.mjs).
//
// Run: npm run test:widget-reliability
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { createChatSseStream } = await import(new URL("../lib/chat-sse-response.ts", import.meta.url).href);
const { parseFrame } = await import(new URL("../lib/chat-stream.ts", import.meta.url).href);
const { settleWithinGrace, applyLateJudgement } = await import(new URL("../lib/chat-late-judgement.ts", import.meta.url).href);
const { WidgetTurnWatch } = await import(new URL("../lib/widget-turn-watch.ts", import.meta.url).href);
const timeouts = await import(new URL("../lib/chat-timeouts.ts", import.meta.url).href);
const { createLoaderHarness, sseResponse, jsonResponse } = await import(
  new URL("./lib/widget-loader-harness.mjs", import.meta.url).href
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads a whole SSE ReadableStream into parsed events, each stamped with its arrival time. */
async function readAll(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";
  const startedAt = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const event = parseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (event) events.push({ ...event, at: Date.now() - startedAt });
    }
  }
  return events;
}

const terminalCount = (events) => events.filter((e) => e.type === "final" || e.type === "error").length;
const types = (events) => events.map((e) => e.type).filter((t) => t !== "ping");

function response(overrides = {}) {
  return { escalate: false, recommendedProducts: [], answer: "", ...overrides };
}

function baseOptions(overrides = {}) {
  const calls = { persisted: [], sideEffects: [], errors: [] };
  const options = {
    meta: { conversationId: "c1", asOf: "2026-11-20T00:00:00.000Z" },
    generate: async function* () {},
    persist: async (r, interrupted) => {
      calls.persisted.push({ r, interrupted });
      return { asOf: "2026-11-20T00:00:01.000Z" };
    },
    sideEffects: async (r, interrupted) => {
      calls.sideEffects.push({ r, interrupted });
    },
    logError: (stage) => calls.errors.push(stage),
    keepAliveMs: 5_000,
    watchdogMs: 5_000,
    ...overrides,
  };
  return { options, calls };
}

// --- Item 1: the stream always ends -----------------------------------------

test("success: meta, deltas, exactly one final, then side effects", async () => {
  const order = [];
  const { options, calls } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Hello. " };
      yield { kind: "delta", text: "Bye." };
      yield { kind: "final", response: response({ escalate: true }), interrupted: false };
    },
    sideEffects: async () => {
      order.push("side_effects");
    },
  });
  const events = await readAll(createChatSseStream(options));
  order.push("closed");
  assert.deepEqual(types(events), ["meta", "delta", "delta", "final"]);
  assert.equal(events.at(-1).escalate, true);
  assert.equal(events.at(-1).asOf, "2026-11-20T00:00:01.000Z");
  assert.equal(calls.persisted.length, 1);
  assert.deepEqual(order, ["side_effects", "closed"], "side effects run after final and before close");
});

test("side effects never delay the terminal event", async () => {
  let finalAt = null;
  let sideEffectsDoneAt = null;
  const { options } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Done." };
      yield { kind: "final", response: response(), interrupted: false };
    },
    sideEffects: async () => {
      await sleep(150);
      sideEffectsDoneAt = Date.now();
    },
  });
  const stream = createChatSseStream(options);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes('"type":"final"')) {
    const { value } = await reader.read();
    text += decoder.decode(value);
  }
  finalAt = Date.now();
  while (!(await reader.read()).done);
  assert.ok(sideEffectsDoneAt - finalAt >= 100, "final arrived well before the side effects finished");
});

test("tool error mid-stream: one error event, stream closes, nothing persisted", async () => {
  const { options, calls } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Let me check. " };
      throw new Error("tool exploded");
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "error"]);
  assert.equal(terminalCount(events), 1);
  assert.equal(calls.persisted.length, 0);
  assert.equal(calls.sideEffects.length, 0);
  assert.deepEqual(calls.errors, ["generate"]);
});

test("guard rewrite (retract) still ends with exactly one final", async () => {
  const { options } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "I have booked you for Monday. " };
      yield { kind: "retract", text: "I can't book a time for you here, but our team can arrange one with you directly." };
      yield { kind: "final", response: response({ escalate: true }), interrupted: false };
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "retract", "final"]);
  assert.equal(terminalCount(events), 1);
});

test("server timeout with partial text: interrupted turn still gets final (it used to get nothing)", async () => {
  const { options, calls } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Our whitening session" };
      yield { kind: "final", response: response({ escalate: true }), interrupted: true };
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "final"]);
  assert.equal(calls.persisted[0].interrupted, true);
  assert.equal(calls.sideEffects[0].interrupted, true);
});

test("persistence failure: error event, stream closes, no side effects", async () => {
  const { options, calls } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Hi." };
      yield { kind: "final", response: response(), interrupted: false };
    },
    persist: async () => {
      throw new Error("db down");
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "error"]);
  assert.equal(calls.sideEffects.length, 0);
});

test("generator ends without a final: error event, never a silent close", async () => {
  const { options } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Hi." };
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "error"]);
});

test("a hung generator is ended by the watchdog: error + close, generator aborted", async () => {
  let sawAbort = false;
  const { options, calls } = baseOptions({
    watchdogMs: 120,
    keepAliveMs: 40,
    generate: async function* (signal) {
      signal.addEventListener("abort", () => {
        sawAbort = true;
      });
      yield { kind: "delta", text: "Checking slots…" };
      await new Promise(() => {}); // never resolves
    },
  });
  const events = await readAll(createChatSseStream(options));
  assert.deepEqual(types(events), ["meta", "delta", "error"]);
  assert.ok(sawAbort, "the generation was aborted");
  assert.ok(calls.errors.includes("watchdog"));
});

test("dropped connection: the client signal aborts the generation; persistence still runs", async () => {
  const client = new AbortController();
  let generationSignal = null;
  const { options, calls } = baseOptions({
    clientSignal: client.signal,
    generate: async function* (signal) {
      generationSignal = signal;
      yield { kind: "delta", text: "Partial" };
      await new Promise((resolve) => signal.addEventListener("abort", resolve));
      yield { kind: "final", response: response(), interrupted: true };
    },
  });
  const stream = createChatSseStream(options);
  const reader = stream.getReader();
  await reader.read(); // meta
  await reader.read(); // delta
  client.abort();
  while (!(await reader.read()).done);
  assert.equal(generationSignal.aborted, true);
  assert.equal(calls.persisted[0].interrupted, true, "a cut-off reply is still recorded as interrupted");
});

test("keep-alive pings are sent while the turn is working, and stop after the terminal event", async () => {
  const { options } = baseOptions({
    keepAliveMs: 40,
    generate: async function* () {
      await sleep(200);
      yield { kind: "delta", text: "Here are the slots." };
      yield { kind: "final", response: response(), interrupted: false };
    },
    sideEffects: async () => {
      await sleep(150);
    },
  });
  const events = await readAll(createChatSseStream(options));
  const finalIndex = events.findIndex((e) => e.type === "final");
  const pingsBefore = events.slice(0, finalIndex).filter((e) => e.type === "ping").length;
  const pingsAfter = events.slice(finalIndex).filter((e) => e.type === "ping").length;
  assert.ok(pingsBefore >= 3, `expected pings while working, got ${pingsBefore}`);
  assert.equal(pingsAfter, 0);
});

test("a 25 s turn with keep-alives does NOT trip the 20 s stall clock (scaled 1:40)", async () => {
  // Real ratios: keep-alive 5 s, stall 20 s, turn 25 s with no text until the end.
  const scale = 1 / 40;
  const { options } = baseOptions({
    keepAliveMs: timeouts.STREAM_KEEPALIVE_INTERVAL_MS * scale,
    watchdogMs: 60_000 * scale,
    generate: async function* () {
      await sleep(25_000 * scale);
      yield { kind: "delta", text: "Saturday 10:00 AM IST works." };
      yield { kind: "final", response: response(), interrupted: false };
    },
  });
  let timedOut = null;
  const watch = new WidgetTurnWatch({
    absoluteMs: timeouts.CHAT_CLIENT_TIMEOUT_MS * scale,
    stallMs: timeouts.STREAM_CLIENT_STALL_TIMEOUT_MS * scale,
    onTimeout: (reason) => {
      timedOut = reason;
    },
  });
  watch.start();
  const reader = createChatSseStream(options).getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    watch.activity(); // the iframe re-arms its stall clock on every relayed event
  }
  watch.stop();
  assert.equal(timedOut, null);
});

test("the same 25 s turn WITHOUT keep-alives would have tripped the stall clock (negative control)", async () => {
  const scale = 1 / 40;
  let timedOut = null;
  const watch = new WidgetTurnWatch({
    absoluteMs: timeouts.CHAT_CLIENT_TIMEOUT_MS * scale,
    stallMs: timeouts.STREAM_CLIENT_STALL_TIMEOUT_MS * scale,
    onTimeout: (reason) => {
      timedOut = reason;
    },
  });
  watch.start();
  watch.activity(); // meta arrived
  await sleep(25_000 * scale + 50);
  watch.stop();
  assert.equal(timedOut, "stall");
});

test("timing contract: grace < keep-alive < stall < watchdog < platform limit < client ceiling", () => {
  assert.ok(timeouts.STREAM_METADATA_GRACE_MS < timeouts.STREAM_KEEPALIVE_INTERVAL_MS);
  assert.ok(timeouts.STREAM_KEEPALIVE_INTERVAL_MS * 3 <= timeouts.STREAM_CLIENT_STALL_TIMEOUT_MS);
  assert.ok(timeouts.STREAM_SERVER_WATCHDOG_MS < timeouts.CHAT_SERVER_MAX_DURATION_SECONDS * 1000);
  assert.ok(timeouts.CHAT_SERVER_MAX_DURATION_SECONDS * 1000 < timeouts.CHAT_CLIENT_TIMEOUT_MS);
});

// --- Item 1: the widget's own turn clocks (fake clock) ----------------------

function fakeClock() {
  let now = 0;
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => {
      timers.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (handle) => timers.delete(handle),
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
  };
}

test("turn watch: the first token no longer clears the absolute clock", () => {
  const clock = fakeClock();
  const fired = [];
  const watch = new WidgetTurnWatch({ absoluteMs: 75_000, stallMs: 20_000, onTimeout: (r) => fired.push(r), ...clock });
  watch.start();
  for (let t = 0; t < 80_000; t += 5_000) {
    watch.activity(); // pings every 5 s forever: a server that never finishes
    clock.advance(5_000);
  }
  assert.deepEqual(fired, ["absolute"]);
});

test("turn watch: a stream that goes silent after its text trips the stall clock (the live freeze)", () => {
  const clock = fakeClock();
  const fired = [];
  const watch = new WidgetTurnWatch({ absoluteMs: 75_000, stallMs: 20_000, onTimeout: (r) => fired.push(r), ...clock });
  watch.start();
  watch.activity(); // stream_start
  clock.advance(1_000);
  watch.activity(); // the whole reply
  clock.advance(19_999);
  assert.deepEqual(fired, []);
  clock.advance(1);
  assert.deepEqual(fired, ["stall"]);
});

test("turn watch: a 25 s booking turn pinging every 5 s completes; stop() disarms both clocks", () => {
  const clock = fakeClock();
  const fired = [];
  const watch = new WidgetTurnWatch({ absoluteMs: 75_000, stallMs: 20_000, onTimeout: (r) => fired.push(r), ...clock });
  watch.start();
  watch.activity();
  for (let t = 0; t < 25_000; t += 5_000) {
    clock.advance(5_000);
    watch.activity();
  }
  watch.stop();
  clock.advance(200_000);
  assert.deepEqual(fired, []);
});

test("turn watch: no stall clock before the first stream event (pre-stream work has no pings)", () => {
  const clock = fakeClock();
  const fired = [];
  const watch = new WidgetTurnWatch({ absoluteMs: 75_000, stallMs: 20_000, onTimeout: (r) => fired.push(r), ...clock });
  watch.start();
  clock.advance(40_000);
  assert.deepEqual(fired, []);
  clock.advance(35_000);
  assert.deepEqual(fired, ["absolute"]);
});

// --- Item 1 / adjustment 4: slow metadata never loses an escalation ---------

test("settleWithinGrace: a fast promise settles, a slow one is handed back still pending", async () => {
  const fast = await settleWithinGrace(Promise.resolve(7), 50);
  assert.deepEqual(fast, { settled: true, value: 7 });
  const slow = await settleWithinGrace(sleep(120).then(() => 8), 30);
  assert.equal(slow.settled, false);
  assert.equal(await slow.pending, 8);
});

test("slow metadata + handoff request: final goes out first, the conversation is STILL flagged", async () => {
  const flagged = [];
  const log = [];
  // The metadata call judges "talk to a person" as an escalation, but only
  // after the grace period (scaled: grace 30 ms, call 150 ms).
  const metadata = sleep(150).then(() => ({ usedContext: false, escalate: true, escalationReason: "prospect_requested_human" }));
  const graced = await settleWithinGrace(metadata, 30);
  assert.equal(graced.settled, false);
  const turnResponse = response({ escalate: false, pendingJudgement: graced.pending });

  let lateWork = null;
  const { options } = baseOptions({
    generate: async function* () {
      yield { kind: "delta", text: "Of course, I'll pass this to our team." };
      yield { kind: "final", response: turnResponse, interrupted: false };
    },
    sideEffects: async (r) => {
      // What the route does: escalate now if known; otherwise apply the late
      // judgement in the background (after()).
      if (r.pendingJudgement) {
        lateWork = applyLateJudgement(r.pendingJudgement, {
          alreadyEscalated: r.escalate,
          flaggedByGuardrails: false,
          hadDocuments: false,
          escalate: async (reason) => {
            flagged.push(reason);
          },
          recordUnanswered: async () => {
            log.push("unanswered");
          },
          log: (event) => log.push(event),
        });
      }
    },
  });
  const events = await readAll(createChatSseStream(options));
  const final = events.find((e) => e.type === "final");
  assert.equal(final.escalate, false, "the terminal event did not wait for the judgement");
  assert.deepEqual(flagged, [], "not flagged yet when the stream closed");
  assert.equal(await lateWork, "escalated");
  assert.deepEqual(flagged, ["prospect_requested_human"], "flagged once the slow judgement arrived");
  assert.ok(!log.includes("unanswered"));
});

test("late judgement: no double escalation, ungrounded non-escalation is logged as unanswered, failure is logged", async () => {
  const deps = (over = {}) => {
    const seen = [];
    return {
      seen,
      deps: {
        alreadyEscalated: false,
        flaggedByGuardrails: false,
        hadDocuments: true,
        escalate: async () => seen.push("escalate"),
        recordUnanswered: async () => seen.push("unanswered"),
        log: (event) => seen.push(event),
        ...over,
      },
    };
  };
  const a = deps({ alreadyEscalated: true });
  assert.equal(await applyLateJudgement(Promise.resolve({ usedContext: true, escalate: true, escalationReason: null }), a.deps), "nothing");
  assert.ok(!a.seen.includes("escalate"));

  const b = deps();
  assert.equal(await applyLateJudgement(Promise.resolve({ usedContext: false, escalate: false, escalationReason: null }), b.deps), "unanswered_logged");

  const c = deps({ flaggedByGuardrails: true });
  assert.equal(await applyLateJudgement(Promise.resolve({ usedContext: false, escalate: false, escalationReason: null }), c.deps), "nothing");

  const d = deps();
  assert.equal(await applyLateJudgement(Promise.reject(new Error("gemini 500")), d.deps), "failed");
  assert.ok(d.seen.includes("ai_stream_metadata_failed"));
});

test("route wiring: the streamed path uses the builder, a pending judgement is applied in after(), never cached unjudged", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /createChatSseStream<SalesEmployeeResponse>\(/);
  assert.match(route, /after\(\(\) =>\s*applyLateJudgement\(pendingJudgement/);
  assert.doesNotMatch(route, /new ReadableStream/);
  const rag = readFileSync(new URL("../lib/rag.ts", import.meta.url), "utf8");
  assert.match(rag, /settleWithinGrace\(metadataOrNull, STREAM_METADATA_GRACE_MS\)/);
  assert.match(rag, /cacheable && source\.kind === "live" && shouldCacheResponse/);
  assert.match(rag, /true,\s*graced\.settled,\s*\)/);
});

// --- Item 1: the loader always hands the iframe a terminal message ----------

function loaderSendSetup() {
  const sse = sseResponse();
  const h = createLoaderHarness({
    fetchHandler: (request) => (request.path === "/api/chat" ? sse.response : undefined),
  });
  h.iframeLoad();
  return { h, sse };
}

test("loader: pings are relayed to the iframe as widget:stream_ping", async () => {
  const { h, sse } = loaderSendSetup();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  sse.push({ type: "meta", conversationId: "22222222-2222-4222-8222-222222222222", asOf: null });
  sse.push({ type: "ping" });
  sse.push({ type: "ping" });
  await h.flush();
  assert.equal(h.postedOfType("widget:stream_ping").length, 2);
});

test("loader: connection dropped after text -> stream_aborted (partial answer kept)", async () => {
  const { h, sse } = loaderSendSetup();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  sse.push({ type: "meta", conversationId: "22222222-2222-4222-8222-222222222222", asOf: null });
  sse.push({ type: "delta", text: "Our prices start" });
  await h.flush();
  sse.drop();
  await h.flush();
  assert.deepEqual(h.postedOfType("widget:stream_aborted").map((m) => m.dropped), [true]);
  assert.equal(h.postedOfType("widget:error").length, 0);
});

test("loader: connection dropped before any text -> widget:error failure", async () => {
  const { h, sse } = loaderSendSetup();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  sse.push({ type: "meta", conversationId: "22222222-2222-4222-8222-222222222222", asOf: null });
  await h.flush();
  sse.drop();
  await h.flush();
  assert.deepEqual(h.postedOfType("widget:error").map((m) => m.kind), ["failure"]);
});

test("loader: a clean close without a terminal event is never silent", async () => {
  const { h, sse } = loaderSendSetup();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  sse.push({ type: "meta", conversationId: "22222222-2222-4222-8222-222222222222", asOf: null });
  sse.push({ type: "delta", text: "Partial" });
  sse.end();
  await h.flush();
  assert.equal(h.postedOfType("widget:stream_aborted").length, 1);
});

test("loader: the iframe's widget:abort (its timeout) cancels the fetch and ends the turn", async () => {
  const { h, sse } = loaderSendSetup();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  sse.push({ type: "meta", conversationId: "22222222-2222-4222-8222-222222222222", asOf: null });
  await h.flush();
  h.fromIframe({ type: "widget:abort", requestId: "r1" });
  await h.flush();
  // The fake reader only rejects on drop(); an aborted real fetch rejects its reads.
  sse.drop();
  await h.flush();
  assert.equal(h.requestsTo("/api/chat")[0].signal.aborted, true);
  assert.equal(h.postedOfType("widget:stream_aborted").length, 1);
});

test("loader: a JSON (human-control) reply is still a single widget:response", async () => {
  const h = createLoaderHarness({
    fetchHandler: (request) =>
      request.path === "/api/chat"
        ? jsonResponse({
            ok: true,
            data: { conversationId: "22222222-2222-4222-8222-222222222222", answer: "A team member will reply.", escalate: false, control: "human", asOf: "2026-11-20T00:00:00.000Z" },
          })
        : undefined,
  });
  h.iframeLoad();
  h.fromIframe({ type: "widget:send", requestId: "r1", text: "hi", consentGiven: false });
  await h.flush();
  assert.equal(h.postedOfType("widget:response").length, 1);
});
