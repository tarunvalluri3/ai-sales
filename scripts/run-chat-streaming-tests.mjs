// Unit tests for the chat-streaming transport and the widget's stream
// assembly (STATE.md, feat/chat-streaming). Node's built-in test runner +
// assert, the same approach as scripts/run-chat-perf-tests.mjs. All three
// modules under test are pure (no server-only, no I/O): the SSE wire codec
// (lib/chat-stream.ts), the message-list reducer (lib/widget-stream-reducer.ts),
// and the iframe<->loader protocol validator (post-message.ts). The actual
// model streaming, DB writes, escalation and tenant isolation are exercised
// by `npm run eval` (the JSON and streaming paths share one pipeline) and
// by the manual steps in STATE.md; this suite nails down the pieces that
// can drift silently and hand a visitor a broken bubble.
//
// Run: npm run test:chat-streaming
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { encodeStreamEvent, parseFrame, asChatStreamEvent, SseBufferParser, clientWantsStream, CHAT_STREAM_CONTENT_TYPE } =
  await import(new URL("../lib/chat-stream.ts", import.meta.url).href);
const { appendStreamDelta, finalizeStreamMessage, finalizeAbortedStream } = await import(
  new URL("../lib/widget-stream-reducer.ts", import.meta.url).href
);
const { parseFromParentMessage } = await import(
  new URL("../app/(widget)/widget/embed/_lib/post-message.ts", import.meta.url).href
);

// --- SSE wire codec -------------------------------------------------------

test("encode -> parseFrame round-trips every event type", () => {
  const events = [
    { type: "meta", conversationId: "c1", asOf: "2026-10-22T00:00:00Z" },
    { type: "delta", text: "Hello" },
    { type: "final", escalate: true, recommendedProducts: [], asOf: null },
    { type: "error", kind: "rate_limited" },
  ];
  for (const event of events) {
    const frame = encodeStreamEvent(event).replace(/\n\n$/, "");
    assert.deepEqual(parseFrame(frame), event);
  }
});

test("a delta containing newlines cannot forge a frame boundary", () => {
  const event = { type: "delta", text: "line one\nline two\n\nstill same chunk" };
  const parser = new SseBufferParser();
  const out = parser.push(encodeStreamEvent(event));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, event.text);
});

test("SseBufferParser reassembles events split across arbitrary chunk boundaries", () => {
  const wire =
    encodeStreamEvent({ type: "meta", conversationId: "c1", asOf: null }) +
    encodeStreamEvent({ type: "delta", text: "Hel" }) +
    encodeStreamEvent({ type: "delta", text: "lo" }) +
    encodeStreamEvent({ type: "final", escalate: false, recommendedProducts: [], asOf: "t" });
  const parser = new SseBufferParser();
  const collected = [];
  // Feed one byte at a time -- the worst case for a streaming parser.
  for (const char of wire) collected.push(...parser.push(char));
  assert.deepEqual(
    collected.map((e) => e.type),
    ["meta", "delta", "delta", "final"],
  );
  assert.equal(collected[1].text + collected[2].text, "Hello");
});

test("parseFrame drops malformed JSON and unknown shapes rather than throwing", () => {
  assert.equal(parseFrame("data: not json"), null);
  assert.equal(parseFrame("data: {\"type\":\"nope\"}"), null);
  assert.equal(parseFrame(": a comment line"), null);
  assert.equal(parseFrame(""), null);
});

test("asChatStreamEvent rejects a final event with a bad escalate type", () => {
  assert.equal(asChatStreamEvent({ type: "final", escalate: "yes", recommendedProducts: [], asOf: null }), null);
  assert.equal(asChatStreamEvent({ type: "error", kind: "weird" }), null);
});

test("asChatStreamEvent keeps only well-formed recommended products", () => {
  const event = asChatStreamEvent({
    type: "final",
    escalate: false,
    asOf: null,
    recommendedProducts: [
      { type: "product", id: "p1", name: "A", description: null, category: null, priceDisplay: null, priceAmount: null, imageUrl: "u" },
      { type: "nope", id: "p2" },
      "garbage",
    ],
  });
  assert.equal(event.recommendedProducts.length, 1);
  assert.equal(event.recommendedProducts[0].id, "p1");
});

test("clientWantsStream honours the Accept header and the body flag, defaults off", () => {
  assert.equal(clientWantsStream(CHAT_STREAM_CONTENT_TYPE, undefined), true);
  assert.equal(clientWantsStream("text/event-stream, */*", undefined), true);
  assert.equal(clientWantsStream(null, true), true);
  assert.equal(clientWantsStream("application/json", undefined), false);
  assert.equal(clientWantsStream(null, undefined), false);
});

// --- widget stream reducer (one bubble, never more) -----------------------

test("many deltas assemble into exactly one bubble", () => {
  const placeholder = "assistant-1";
  let messages = [
    { id: "user-1", role: "user", content: "hi" },
    { id: placeholder, role: "assistant", content: "" },
  ];
  for (const piece of ["Thanks ", "for ", "asking!"]) {
    messages = appendStreamDelta(messages, placeholder, piece);
  }
  const assistants = messages.filter((m) => m.role === "assistant");
  assert.equal(assistants.length, 1);
  assert.equal(assistants[0].content, "Thanks for asking!");
  // The user message is untouched.
  assert.equal(messages.find((m) => m.id === "user-1").content, "hi");
});

test("finalizeStreamMessage attaches terminal metadata to the one bubble", () => {
  const messages = finalizeStreamMessage(
    [{ id: "a1", role: "assistant", content: "done" }],
    "a1",
    { escalate: true, recommendedProducts: [{ id: "p1" }] },
  );
  assert.equal(messages[0].escalate, true);
  assert.equal(messages[0].recommendedProducts.length, 1);
  assert.equal(messages[0].content, "done");
});

test("an aborted stream keeps partial text but drops a bubble that never streamed", () => {
  const withText = finalizeAbortedStream(
    [{ id: "a1", role: "assistant", content: "half an ans" }],
    "a1",
  );
  assert.equal(withText.length, 1);
  assert.equal(withText[0].content, "half an ans");

  const empty = finalizeAbortedStream(
    [
      { id: "user-1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "" },
    ],
    "a1",
  );
  assert.equal(empty.length, 1);
  assert.equal(empty[0].id, "user-1");
});

// --- iframe<->loader protocol validator -----------------------------------

test("parseFromParentMessage accepts the three streaming messages", () => {
  assert.deepEqual(parseFromParentMessage({ type: "widget:stream_start", requestId: "r1", conversationId: "c1" }), {
    type: "widget:stream_start",
    requestId: "r1",
    conversationId: "c1",
  });
  assert.deepEqual(parseFromParentMessage({ type: "widget:stream_delta", requestId: "r1", text: "hi" }), {
    type: "widget:stream_delta",
    requestId: "r1",
    text: "hi",
  });
  const end = parseFromParentMessage({
    type: "widget:stream_end",
    requestId: "r1",
    escalate: true,
    recommendedProducts: [],
  });
  assert.equal(end.type, "widget:stream_end");
  assert.equal(end.escalate, true);
  assert.deepEqual(parseFromParentMessage({ type: "widget:stream_aborted", requestId: "r1" }), {
    type: "widget:stream_aborted",
    requestId: "r1",
  });
});

test("parseFromParentMessage rejects malformed streaming messages", () => {
  assert.equal(parseFromParentMessage({ type: "widget:stream_delta", requestId: "r1" }), null);
  assert.equal(parseFromParentMessage({ type: "widget:stream_start", requestId: "r1" }), null);
  assert.equal(parseFromParentMessage({ type: "widget:stream_end", requestId: "r1", escalate: "nope" }), null);
  assert.equal(parseFromParentMessage({ type: "widget:unknown" }), null);
});
