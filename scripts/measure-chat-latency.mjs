#!/usr/bin/env node
/**
 * Local time-to-first-token / total-response-time harness for the chat
 * widget path (STATE.md, "feat/chat-streaming"). Mirrors scripts/run-evals.mjs's
 * auth exactly (Acme Test Co.'s active widget key + an explicit Origin
 * header) and the 2026-10-21 latency methodology: every *measured* turn is
 * sent as the SECOND turn of a fresh conversation, so Phase 23's first-turn
 * response cache can never serve a previous run's answer and flatter the
 * numbers.
 *
 * Two modes, selected by MODE (default "json"):
 *   - json:   POST without an Accept override -> the buffered JSON path
 *             (what every currently-live loader gets). The answer arrives
 *             all at once, so time-to-first-token == total by construction.
 *   - stream: POST with `Accept: text/event-stream` -> the streamed path.
 *             TTFT is measured to the first `delta` event; total to the
 *             terminal `final`/`error` event.
 *
 * Run: MODE=stream node --env-file=.env.local scripts/measure-chat-latency.mjs
 * Reports p50/p95 for TTFT and total. n is small and local by design --
 * the real p50/p95 come from production rows after a week of traffic, kept
 * clearly separate in the report.
 */
import { createClient } from "@supabase/supabase-js";
import { requireProdConfirmation } from "./lib/usage-guard.mjs";

const APP_URL = process.env.EVAL_APP_URL || "http://localhost:3000";
const ORIGIN = process.env.EVAL_ORIGIN || APP_URL;
const MODE = process.env.MODE === "stream" ? "stream" : "json";
const ACME_BUSINESS_NAME = "Acme Test Co.";
const RUNS = Number.parseInt(process.env.RUNS || "8", 10);

// A mix of no-tool and catalog-ish questions, the same shapes the latency
// pass used. Kept generic so a prompt change doesn't invalidate them.
const QUESTIONS = [
  "What do you offer?",
  "Tell me about Test Product - 1.",
  "Do you have anything for syncing knowledge?",
  "What is included with your service?",
  "How much is Test Product - 1?",
  "What makes your product a good fit for a small team?",
  "Can you summarise what Acme does?",
  "What are the main features?",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. Run via: MODE=${MODE} node --env-file=.env.local scripts/measure-chat-latency.mjs`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"));

async function getAcmeWidgetKey() {
  const { data: business } = await supabase.from("businesses").select("id").eq("name", ACME_BUSINESS_NAME).maybeSingle();
  if (!business) {
    console.error(`Could not find "${ACME_BUSINESS_NAME}".`);
    process.exit(1);
  }
  const { data: keyRow } = await supabase
    .from("widget_keys")
    .select("key")
    .eq("business_id", business.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!keyRow) {
    console.error(`No active widget key for "${ACME_BUSINESS_NAME}".`);
    process.exit(1);
  }
  return keyRow.key;
}

/** Non-streaming POST: total == TTFT (answer arrives in one shot). Returns {ttft, total, conversationId}. */
async function withRetry(fn) {
  // A transient 429 (the rate-limit counter call fails closed on an infrastructure error) must not abort a measurement run; the failed attempt is not timed.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 3 || !String(error?.message).includes("429")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function sendJson(widgetKey, message, conversationId) {
  const startedAt = performance.now();
  const response = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ widgetKey, message, conversationId }),
  });
  const body = await response.json().catch(() => null);
  const total = performance.now() - startedAt;
  if (!response.ok || !body?.ok) throw new Error(`/api/chat ${response.status}: ${JSON.stringify(body)}`);
  return { ttft: total, total, conversationId: body.data.conversationId };
}

/** Streaming POST: TTFT to first `delta`, total to terminal event. Returns {ttft, total, conversationId}. */
async function sendStream(widgetKey, message, conversationId) {
  const startedAt = performance.now();
  const response = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Origin: ORIGIN },
    body: JSON.stringify({ widgetKey, message, conversationId }),
  });
  if (!response.ok || !response.body) throw new Error(`/api/chat ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ttft = null;
  let resolvedConversationId = conversationId;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.replace(/^data:\s?/, ""));
      } catch {
        continue;
      }
      if (event.type === "meta" && event.conversationId) resolvedConversationId = event.conversationId;
      if (event.type === "delta" && ttft === null) ttft = performance.now() - startedAt;
    }
  }
  const total = performance.now() - startedAt;
  return { ttft: ttft ?? total, total, conversationId: resolvedConversationId };
}

const sendOnce = MODE === "stream" ? sendStream : sendJson;
const send = (...args) => withRetry(() => sendOnce(...args));

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

async function main() {
  // Each run is 2 real turns (an unmeasured warm-up + the measured 2nd
  // turn), each up to ~5 Gemini calls (lib/rag.ts: up to MAX_TOOL_ITERATIONS
  // chat calls + 1 retrieval embedding; stream mode also fires the
  // concurrent metadata call).
  await requireProdConfirmation({
    scriptName: "measure-chat-latency.mjs",
    appUrl: APP_URL,
    estimateLine: `Estimated real Gemini calls: up to ~${RUNS * 2 * 5} (${RUNS} run(s) x 2 turns x up to ~5 calls, MODE=${MODE}).`,
  });

  const widgetKey = await getAcmeWidgetKey();
  console.log(`MODE=${MODE} against ${APP_URL}, ${RUNS} measured turns (each a 2nd turn), business "${ACME_BUSINESS_NAME}"\n`);
  const ttfts = [];
  const totals = [];
  for (let i = 0; i < RUNS; i++) {
    const question = QUESTIONS[i % QUESTIONS.length];
    // Turn 1 (warm-up, not measured): a fresh conversation. Its answer is
    // cache-eligible; the measured turn below is the 2nd turn, which is not.
    const warm = await send(widgetKey, "Hi", undefined);
    // Turn 2 (measured): reuse the conversation so it is never first-turn.
    const measured = await send(widgetKey, question, warm.conversationId);
    ttfts.push(measured.ttft);
    totals.push(measured.total);
    console.log(`  #${i + 1} ttft=${Math.round(measured.ttft)}ms total=${Math.round(measured.total)}ms  "${question}"`);
  }
  ttfts.sort((a, b) => a - b);
  totals.sort((a, b) => a - b);
  console.log(`\n=== ${MODE} (n=${RUNS}, local) ===`);
  console.log(`TTFT   p50=${pct(ttfts, 50)}ms  p95=${pct(ttfts, 95)}ms  min=${Math.round(ttfts[0])}ms  max=${Math.round(ttfts[ttfts.length - 1])}ms`);
  console.log(`total  p50=${pct(totals, 50)}ms  p95=${pct(totals, 95)}ms  min=${Math.round(totals[0])}ms  max=${Math.round(totals[totals.length - 1])}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
