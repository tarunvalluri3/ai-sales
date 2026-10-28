// Unit tests for the guardrail response path and the owner's marker
// (guardrails Phase 5, STATE.md): lib/guardrails/response-policy.ts and the
// wiring that puts it in the widget route, WhatsApp, Instagram and the
// dashboard. Pure modules plus structural checks; no network, no model.
//
// Run: npm run test:guardrail-response
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

register("./alias-resolver-hooks.mjs", import.meta.url);

const policy = await import(new URL("../lib/guardrails/response-policy.ts", import.meta.url).href);
const { GUARDRAIL_SAFE_REPLY } = await import(new URL("../lib/guardrails/output-check.ts", import.meta.url).href);
const { GUARDRAIL_MODES } = await import(new URL("../lib/guardrails/config.ts", import.meta.url).href);
const {
  ABUSE_HANDOVER_MESSAGE,
  ABUSE_STRIKE_LIMIT,
  FLAG_SIGNALS,
  describeGuardrailFlags,
  hasClassifierFlag,
  resolveInputGuardrailAction,
} = policy;

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const signal = (type) => ({ type, rule: "test", action: "logged", mode: "log_only" });
const LOG_ONLY = { injection: "log_only", abuse: "log_only" };
const ENFORCE = { injection: "enforce", abuse: "enforce" };
const INJECTION_TYPES = ["instruction_override", "prompt_extraction", "role_hijack", "tag_forgery", "encoded_payload"];

// ------------------------------------------------------------------- policy

test("rollout: every classifier check ships log-only, so this path changes no behaviour yet", () => {
  assert.equal(GUARDRAIL_MODES.injection, "log_only");
  assert.equal(GUARDRAIL_MODES.abuse, "log_only");
  for (const type of [...INJECTION_TYPES, "abuse"]) {
    assert.deepEqual(resolveInputGuardrailAction([signal(type)], 99), { kind: "none" }, `${type} with the real config`);
  }
  assert.deepEqual(resolveInputGuardrailAction([signal("abuse")], 99, LOG_ONLY), { kind: "none" });
});

test("enforce: each injection signal gets the one fixed safe reply and a handover reason, with no model involved", () => {
  for (const type of INJECTION_TYPES) {
    const action = resolveInputGuardrailAction([signal(type)], 0, ENFORCE);
    assert.equal(action.kind, "safe_reply", type);
    assert.equal(action.reply, GUARDRAIL_SAFE_REPLY, "the reply is the same fixed text the output guard uses");
    assert.equal(action.reason, `guardrail:${type}`);
  }
});

test("enforce: ordinary signals (masking, sanitising) never trigger the response path", () => {
  for (const type of ["sensitive_data", "invisible_characters", "message_truncated"]) {
    assert.deepEqual(resolveInputGuardrailAction([signal(type)], 0, ENFORCE), { kind: "none" }, type);
  }
  assert.deepEqual(resolveInputGuardrailAction([], 0, ENFORCE), { kind: "none" });
});

test("enforce: repeated abuse ends the AI's replies at the strike limit, and stays ended for every later message", () => {
  assert.equal(ABUSE_STRIKE_LIMIT, 3);
  assert.deepEqual(resolveInputGuardrailAction([signal("abuse")], 0, ENFORCE), { kind: "none" }, "1st strike: the AI still answers politely");
  assert.deepEqual(resolveInputGuardrailAction([signal("abuse")], 1, ENFORCE), { kind: "none" }, "2nd strike");
  const third = resolveInputGuardrailAction([signal("abuse")], 2, ENFORCE);
  assert.equal(third.kind, "end_ai_replies");
  assert.equal(third.reply, ABUSE_HANDOVER_MESSAGE);
  assert.equal(third.reason, "guardrail:repeated_abuse");
  // The prior count never goes down, so a polite message afterwards is still not answered by the AI.
  assert.equal(resolveInputGuardrailAction([], 3, ENFORCE).kind, "end_ai_replies");
  assert.equal(resolveInputGuardrailAction([signal("sensitive_data")], 5, ENFORCE).kind, "end_ai_replies");
});

test("enforce: when abuse and injection coincide, ending the AI's replies wins", () => {
  assert.equal(resolveInputGuardrailAction([signal("abuse"), signal("instruction_override")], 2, ENFORCE).kind, "end_ai_replies");
  assert.equal(resolveInputGuardrailAction([signal("abuse"), signal("instruction_override")], 0, ENFORCE).kind, "safe_reply");
});

test("enforce: each check is switched independently", () => {
  assert.equal(resolveInputGuardrailAction([signal("instruction_override")], 0, { injection: "enforce", abuse: "log_only" }).kind, "safe_reply");
  assert.equal(resolveInputGuardrailAction([signal("abuse")], 9, { injection: "enforce", abuse: "log_only" }).kind, "none");
  assert.equal(resolveInputGuardrailAction([signal("instruction_override")], 0, { injection: "log_only", abuse: "enforce" }).kind, "none");
});

test("the fixed replies are not model output: constant text with no placeholders", () => {
  for (const text of [GUARDRAIL_SAFE_REPLY, ABUSE_HANDOVER_MESSAGE]) {
    assert.ok(text.length > 20 && text.length < 200);
    assert.doesNotMatch(text, /\{|\}|\$\{|http|@/);
  }
});

test("hasClassifierFlag: true for injection and abuse signals only", () => {
  assert.equal(hasClassifierFlag([signal("abuse")]), true);
  assert.equal(hasClassifierFlag([signal("tag_forgery")]), true);
  assert.equal(hasClassifierFlag([signal("sensitive_data"), signal("message_truncated")]), false);
  assert.equal(hasClassifierFlag([]), false);
});

// ---------------------------------------------------------- owner's marker

test("marker: counts are described per kind, singular and plural, merged where two signals mean the same thing", () => {
  assert.deepEqual(describeGuardrailFlags([]), []);
  assert.deepEqual(describeGuardrailFlags(["instruction_override"]), ["1 prompt-injection attempt"]);
  assert.deepEqual(describeGuardrailFlags(["instruction_override", "instruction_override", "abuse"]), [
    "2 prompt-injection attempts",
    "1 abusive message",
  ]);
  assert.deepEqual(describeGuardrailFlags(["output_canary_leak", "output_verbatim_leak"]), ["2 replies blocked (instruction leak)"]);
});

test("marker: bookkeeping and informational signals are never shown to the owner as flags", () => {
  assert.deepEqual(describeGuardrailFlags(["write_tool_call", "sensitive_data", "invisible_characters", "message_truncated"]), []);
});

test("marker: every flag-worthy signal has a label, and the cap hit is both flagged and persisted", () => {
  for (const name of FLAG_SIGNALS) {
    assert.equal(describeGuardrailFlags([name]).length, 1, `${name} must have an owner-facing label`);
  }
  assert.ok(FLAG_SIGNALS.includes("write_tool_cap"));
  assert.match(read("lib/guardrails/write-caps.ts"), /signal: "write_tool_cap"/);
});

// ------------------------------------------------------------------ wiring

test("wiring: the widget route runs the policy after the human-control check and before any model call, through the one escalation path", () => {
  const route = read("app/api/chat/route.ts");
  const human = route.indexOf('conversation.control === "human"');
  const writeFn = route.indexOf("const writeAssistantMessage");
  const finalizeFn = route.indexOf("const finalizeTurnSideEffects");
  const policyCall = route.indexOf("resolveInputGuardrailAction(prepared.signals, abuseStrikes)");
  const streamBranch = route.indexOf("if (clientWantsStream(");
  const firstModelCall = Math.min(route.indexOf("for await (const chunk of streamSalesEmployee("), route.indexOf("response = await askSalesEmployee("));
  assert.ok(human > 0 && human < policyCall);
  assert.ok(writeFn < policyCall && finalizeFn < policyCall, "it reuses the shared persistence and escalation closures");
  assert.ok(policyCall < streamBranch && policyCall < firstModelCall, "no model call can precede it");
  const branch = route.slice(policyCall, streamBranch);
  assert.match(branch, /escalate: true/);
  assert.match(branch, /writeAssistantMessage\(guardrailResponse, false\)/);
  assert.match(branch, /finalizeTurnSideEffects\(guardrailResponse, false\)/);
  assert.match(branch, /return withCors\(/);
});

test("wiring: the abuse strike count rides the existing parallel batch", () => {
  const route = read("app/api/chat/route.ts");
  assert.match(route, /priorHistory, abuseStrikes\] = await Promise\.all\(/);
  assert.match(route, /countAbuseStrikes\(supabase, business\.businessId, conversationRowId\)/);
  const events = read("lib/guardrails/events.ts");
  assert.match(events, /GUARDRAIL_MODES\.abuse !== "enforce"\) return 0/, "no query while the abuse check is log-only");
});

test("wiring: guardrail-flagged messages stay out of the owner's unanswered questions", () => {
  const route = read("app/api/chat/route.ts");
  assert.match(route, /const flaggedByGuardrails = hasClassifierFlag\(prepared\.signals\)/);
  assert.match(route, /!response\.escalate && !flaggedByGuardrails/);
});

test("wiring: WhatsApp and Instagram flag the conversation, send the fixed reply and stop before the model", () => {
  for (const [file, send] of [
    ["app/api/webhooks/whatsapp/route.ts", "sendCannedReply(supabase, businessId, conversation.id, phoneNumberId, message.from, inputAction.reply)"],
    ["app/api/webhooks/instagram/route.ts", "sendCannedReply(supabase, businessId, conversation.id, instagramBusinessAccountId, event.sender.id, inputAction.reply)"],
  ]) {
    const source = read(file);
    const policyAt = source.indexOf("resolveInputGuardrailAction(");
    const modelAt = source.indexOf("const response = await askSalesEmployee(");
    assert.ok(policyAt > 0 && policyAt < modelAt, `${file}: policy must run before the model`);
    const branch = source.slice(policyAt, modelAt);
    assert.match(branch, /flagConversationNeedsAttention\(/);
    assert.ok(branch.includes(send), `${file}: sends the fixed reply`);
    assert.match(branch, /return;/);
  }
});

test("wiring: the owner sees a flag card only when something was flagged, read under the owner's own session", () => {
  const panel = read("app/(dashboard)/dashboard/conversations/_components/info-panel.tsx");
  assert.match(panel, /guardrailFlags\.length > 0 \?/);
  assert.match(panel, /Flagged by guardrails/);
  const page = read("app/(dashboard)/dashboard/conversations/[id]/page.tsx");
  assert.match(page, /listConversationGuardrailFlags\(supabase, businessId, conversation\.id\)/);
  assert.match(page, /guardrailFlags=\{describeGuardrailFlags\(guardrailFlagSignals\)\}/);
  const events = read("lib/guardrails/events.ts");
  assert.match(events, /\.eq\("business_id", businessId\)\s*\.eq\("conversation_id", conversationId\)\s*\.in\("signal"/);
});

test("wiring: per-business, per-type counts are available for the false-positive review", () => {
  const events = read("lib/guardrails/events.ts");
  assert.match(events, /export async function countGuardrailEventsByType/);
  assert.match(events, /\.eq\("business_id", businessId\)\s*\.gte\("created_at", sinceIso\)/);
});
