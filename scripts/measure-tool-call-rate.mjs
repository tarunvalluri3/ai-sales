#!/usr/bin/env node
/**
 * Tool-call-rate harness for prompt changes (guardrails Phase 2, STATE.md).
 *
 * STATE.md records that a prompt edit can change WHICH tools the model calls
 * even when every answer still reads fine (2026-10-21 send_reply work: a
 * wording change turned cheap no-tool turns into slow one-tool turns). The
 * eval suite checks answers, not tool use, so this script measures it
 * directly: a fixed set of questions, each asked REPS times as the 2nd turn
 * of a fresh Acme Test Co. conversation (a 1st turn can be served by the
 * instant-answer or response cache without a model call), then reads
 * `tool_call_count` and the tool names from the turn's `ai_response_metrics`
 * row. Run it before and after any lib/rag.ts prompt change and compare.
 *
 * Run: EVAL_APP_URL=http://localhost:3000 OUT=before.json \
 *        node --env-file=.env.local scripts/measure-tool-call-rate.mjs
 * Compare: node scripts/measure-tool-call-rate.mjs --compare before.json after.json
 *
 * Real Gemini calls and real (production) Supabase, Acme Test Co. only.
 * Retries 429s: the per-IP limit is 30 requests / 5 min, so the run paces
 * itself and also tolerates the local idle-connection hiccup documented in
 * STATE.md.
 */
import { readFileSync, writeFileSync } from "node:fs";

const QUESTIONS = [
  "What is the price of Test Product - 1?",
  "What do you offer?",
  "Tell me about your Knowledge Sync service.",
  "What does Acme Test Co. provide?",
  "What is the price of the Quantum Flux Capacitor 9000?",
  "What is your refund and warranty policy?",
  "Can I speak to a real person please?",
  "Can you give me a 50% discount on Test Product - 1?",
  "What is your contact email and phone number?",
  "Can you help me with my math homework?",
  "Do you support integrations with other tools?",
  "I'm interested in a plan for a team of 10, what would you recommend?",
];
const REPS = Number.parseInt(process.env.REPS || "2", 10);
const APP_URL = process.env.EVAL_APP_URL || "http://localhost:3000";
const PACE_MS = 10_500;

if (process.argv[2] === "--compare") {
  const [a, b] = [process.argv[3], process.argv[4]].map((p) => JSON.parse(readFileSync(p, "utf8")));
  const rate = (rows) => rows.reduce((n, r) => n + r.toolCalls, 0) / rows.length;
  console.log(`overall tool calls / turn: ${rate(a.rows).toFixed(2)} -> ${rate(b.rows).toFixed(2)}`);
  console.log(`turns with >=1 tool:       ${a.rows.filter((r) => r.toolCalls > 0).length}/${a.rows.length} -> ${b.rows.filter((r) => r.toolCalls > 0).length}/${b.rows.length}`);
  for (const q of QUESTIONS) {
    const x = a.rows.filter((r) => r.question === q);
    const y = b.rows.filter((r) => r.question === q);
    const fmt = (rows) => `${rows.map((r) => r.toolCalls).join(",")} [${[...new Set(rows.flatMap((r) => r.tools))].join("+") || "-"}] esc=${rows.filter((r) => r.escalate).length}/${rows.length}`;
    console.log(`${x.map((r) => r.toolCalls).join(",") === y.map((r) => r.toolCalls).join(",") ? "  same " : "  DIFF "} ${q.slice(0, 48).padEnd(48)} ${fmt(x)}  ->  ${fmt(y)}`);
  }
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data: business } = await supabase.from("businesses").select("id").eq("name", "Acme Test Co.").single();
const { data: keyRow } = await supabase.from("widget_keys").select("key").eq("business_id", business.id).eq("status", "active").limit(1).single();

let lastSend = 0;
async function send(message, conversationId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = PACE_MS - (Date.now() - lastSend);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSend = Date.now();
    const response = await fetch(`${APP_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_URL },
      body: JSON.stringify({ widgetKey: keyRow.key, message, conversationId }),
    });
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) throw new Error(`/api/chat ${response.status}: ${JSON.stringify(body)}`);
    return body.data;
  }
  throw new Error("rate limited repeatedly");
}

const rows = [];
for (let rep = 0; rep < REPS; rep++) {
  for (const question of QUESTIONS) {
    const warm = await send("Hi", undefined);
    const turn = await send(question, warm.conversationId);
    await new Promise((r) => setTimeout(r, 1500)); // metrics row is finalised after the reply
    const { data: metric } = await supabase
      .from("ai_response_metrics")
      .select("tool_call_count, stage_timings")
      .eq("conversation_id", warm.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tools = (metric?.stage_timings ?? []).flatMap((s) => s.tools ?? []);
    rows.push({ question, toolCalls: metric?.tool_call_count ?? 0, tools, escalate: Boolean(turn.escalate), answer: turn.answer });
    console.log(`  ${String(metric?.tool_call_count ?? "?")} tool(s) [${tools.join("+") || "-"}] esc=${turn.escalate}  ${question.slice(0, 50)}`);
  }
}
const total = rows.reduce((n, r) => n + r.toolCalls, 0);
console.log(`\ntool calls / turn: ${(total / rows.length).toFixed(2)}  turns with >=1 tool: ${rows.filter((r) => r.toolCalls > 0).length}/${rows.length}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
