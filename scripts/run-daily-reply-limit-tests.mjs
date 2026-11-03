// Daily AI reply limits on every channel (production readiness round 3, item 1, 2026-11-03).
//   1. BEHAVIOURAL (pure, every side effect mocked -- no database, no Gemini,
//      no Meta): the verdict (per business, overall, 0 = off, counter failure =
//      blocked), the once-per-day alert, the notice decision (website always;
//      WhatsApp/Instagram once per conversation per day, only inside the 24-hour
//      window, never on a counter error), and the orchestration's failure paths
//      (counter throws, flag throws, notice counter throws).
//   2. STRUCTURAL: each channel calls the shared check once, after its gates and
//      the webhook de-duplication and before the model; nothing else calls
//      Gemini on a blocked turn; the migration adds the notice scope.
//
// Run: npm run test:daily-reply-limit
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/daily-reply-limit-rules.ts", import.meta.url).href);
const cp = await import(new URL("../lib/chat-protection.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const CAPS = { perBusiness: 3, global: 10 };
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

// ------------------------------------------------------------ config

test("defaults: 1,000 per business, 5,000 overall; both configurable; 0 = off", () => {
  const defaults = cp.chatProtectionConfigFromEnv({});
  assert.equal(defaults.geminiDailyTurnsPerBusiness, 1000);
  assert.equal(defaults.geminiDailyTurnsGlobal, 5000);
  const custom = cp.chatProtectionConfigFromEnv({ GEMINI_DAILY_TURN_CAP_PER_BUSINESS: "50", GEMINI_DAILY_TURN_CAP_GLOBAL: "0" });
  assert.equal(custom.geminiDailyTurnsPerBusiness, 50);
  assert.equal(custom.geminiDailyTurnsGlobal, 0);
  assert.equal(cp.chatProtectionConfigFromEnv({ GEMINI_DAILY_TURN_CAP_GLOBAL: "lots" }).geminiDailyTurnsGlobal, 5000, "malformed -> default");
});

// ------------------------------------------------------------ verdict

test("verdict: at the cap is allowed, one over is blocked; overall reported first", () => {
  assert.deepEqual(rules.dailyLimitVerdict({ business: 3, global: 10 }, CAPS), { allowed: true });
  assert.deepEqual(rules.dailyLimitVerdict({ business: 4, global: 5 }, CAPS), { allowed: false, reason: "business" });
  assert.deepEqual(rules.dailyLimitVerdict({ business: 1, global: 11 }, CAPS), { allowed: false, reason: "global" });
  assert.deepEqual(rules.dailyLimitVerdict({ business: 99, global: 99 }, CAPS), { allowed: false, reason: "global" });
});

test("verdict: a counter that can't be read is BLOCKED (fail closed), unless its cap is off", () => {
  assert.deepEqual(rules.dailyLimitVerdict({ business: null, global: null }, CAPS), { allowed: false, reason: "counter_unavailable" });
  assert.deepEqual(rules.dailyLimitVerdict({ business: 1, global: null }, CAPS), { allowed: false, reason: "counter_unavailable" });
  assert.deepEqual(rules.dailyLimitVerdict({ business: null, global: 1 }, CAPS), { allowed: false, reason: "counter_unavailable" });
  assert.deepEqual(rules.dailyLimitVerdict({ business: 9, global: null }, CAPS), { allowed: false, reason: "business" }, "a known breach wins");
  assert.deepEqual(rules.dailyLimitVerdict({ business: null, global: null }, { perBusiness: 0, global: 0 }), { allowed: true }, "both off");
  assert.deepEqual(rules.dailyLimitVerdict({ business: 2, global: null }, { perBusiness: 3, global: 0 }), { allowed: true }, "global off");
});

test("alert fires only for the request that crossed a cap (count === cap + 1)", () => {
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: 3, global: 10 }, CAPS), []);
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: 4, global: 5 }, CAPS), ["business"]);
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: 5, global: 5 }, CAPS), [], "already past: no repeat");
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: 4, global: 11 }, CAPS), ["global", "business"]);
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: null, global: null }, CAPS), []);
  assert.deepEqual(rules.capsCrossedByThisRequest({ business: 1, global: 1 }, { perBusiness: 0, global: 0 }), [], "0 = off never alerts");
});

// ------------------------------------------------------------ notice

test("notice: website always replies (the visitor is waiting on this request)", () => {
  assert.equal(rules.limitNoticeDecision({ channel: "website", inboundAtMs: null, nowMs: NOW, noticeCount: null }), "send");
  assert.equal(rules.limitNoticeDecision({ channel: "website", inboundAtMs: null, nowMs: NOW, noticeCount: 7 }), "send");
});

test("notice: WhatsApp/Instagram once per conversation per day, inside the 24-hour window only", () => {
  for (const channel of ["whatsapp", "instagram"]) {
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: NOW - 5000, nowMs: NOW, noticeCount: 1 }), "send");
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: NOW - 5000, nowMs: NOW, noticeCount: 2 }), "skip_already_sent");
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: null, nowMs: NOW, noticeCount: 1 }), "send", "unknown time = just arrived");
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: NOW - DAY_MS, nowMs: NOW, noticeCount: 1 }), "send", "exactly 24 h is still open");
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: NOW - DAY_MS - 1, nowMs: NOW, noticeCount: 1 }), "skip_window_closed");
    assert.equal(rules.limitNoticeDecision({ channel, inboundAtMs: NOW, nowMs: NOW, noticeCount: null }), "skip_notice_unknown", "never risk a duplicate");
  }
});

test("WhatsApp timestamp parsing", () => {
  assert.equal(rules.whatsappTimestampToMs("1762171200"), 1762171200000);
  assert.equal(rules.whatsappTimestampToMs(undefined), null);
  assert.equal(rules.whatsappTimestampToMs("abc"), null);
  assert.equal(rules.whatsappTimestampToMs("-5"), null);
});

// ------------------------------------------------------------ orchestration (mocked)

function harness({ counts, noticeCounts = [], incrementThrows = false, flagThrows = false, noticeThrows = false, now = NOW } = {}) {
  const calls = { increments: 0, noticeIncrements: 0, flags: 0, capAlerts: [], counterAlerts: 0, logs: [] };
  const deps = {
    incrementDailyCounters: async () => {
      calls.increments += 1;
      if (incrementThrows) throw new Error("db down");
      return counts;
    },
    incrementNoticeCounter: async () => {
      calls.noticeIncrements += 1;
      if (noticeThrows) throw new Error("db down");
      return noticeCounts.shift() ?? null;
    },
    flagConversation: async () => {
      calls.flags += 1;
      if (flagThrows) throw new Error("flag failed");
    },
    alertCapReached: (which) => calls.capAlerts.push(which),
    alertCounterUnavailable: () => {
      calls.counterAlerts += 1;
    },
    log: (event, fields, level) => calls.logs.push({ event, fields, level }),
    nowMs: () => now,
  };
  return { deps, calls };
}

const params = (channel, extra = {}) => ({ channel, businessId: "biz-a", conversationId: "conv-1", inboundAtMs: NOW - 1000, caps: CAPS, ...extra });

test("under the caps: allowed, counted once, nothing flagged or alerted", async () => {
  const { deps, calls } = harness({ counts: { business: 2, global: 7 } });
  assert.deepEqual(await rules.runDailyReplyLimit(deps, params("whatsapp")), { allowed: true });
  assert.equal(calls.increments, 1);
  assert.equal(calls.flags, 0);
  assert.equal(calls.noticeIncrements, 0);
  assert.deepEqual(calls.capAlerts, []);
});

test("crossing the business cap: blocked, flagged, alerted once, notice sent once", async () => {
  const first = harness({ counts: { business: 4, global: 8 }, noticeCounts: [1] });
  const result = await rules.runDailyReplyLimit(first.deps, params("whatsapp"));
  assert.deepEqual(result, { allowed: false, reason: "business", notice: "send" });
  assert.equal(first.calls.flags, 1);
  assert.deepEqual(first.calls.capAlerts, ["business"]);

  // The next message in the same conversation: still blocked, no alert, no second notice.
  const second = harness({ counts: { business: 5, global: 9 }, noticeCounts: [2] });
  const again = await rules.runDailyReplyLimit(second.deps, params("whatsapp"));
  assert.deepEqual(again, { allowed: false, reason: "business", notice: "skip_already_sent" });
  assert.equal(second.calls.flags, 1, "still flagged");
  assert.deepEqual(second.calls.capAlerts, [], "no repeated alert");
});

test("overall cap on Instagram: blocked with the global reason", async () => {
  const { deps, calls } = harness({ counts: { business: 1, global: 11 }, noticeCounts: [1] });
  assert.deepEqual(await rules.runDailyReplyLimit(deps, params("instagram")), { allowed: false, reason: "global", notice: "send" });
  assert.deepEqual(calls.capAlerts, ["global"]);
});

test("counter returns null: blocked like over the limit, logged, throttled outage alert, flagged", async () => {
  const { deps, calls } = harness({ counts: { business: null, global: null }, noticeCounts: [1] });
  const result = await rules.runDailyReplyLimit(deps, params("whatsapp"));
  assert.deepEqual(result, { allowed: false, reason: "counter_unavailable", notice: "send" });
  assert.equal(calls.counterAlerts, 1);
  assert.equal(calls.flags, 1);
  assert.ok(calls.logs.some((l) => l.event === "gemini_daily_cap_blocked" && l.fields.cap === "counter_unavailable"));
});

test("counter THROWS: still blocked (never calls the model), not rethrown", async () => {
  const { deps, calls } = harness({ incrementThrows: true, noticeCounts: [1] });
  const result = await rules.runDailyReplyLimit(deps, params("website"));
  assert.deepEqual(result, { allowed: false, reason: "counter_unavailable", notice: "send" });
  assert.equal(calls.counterAlerts, 1);
  assert.equal(calls.noticeIncrements, 0, "website needs no notice counter");
});

test("flagging fails: logged, verdict unchanged", async () => {
  const { deps, calls } = harness({ counts: { business: 4, global: 1 }, noticeCounts: [1], flagThrows: true });
  assert.deepEqual(await rules.runDailyReplyLimit(deps, params("instagram")), { allowed: false, reason: "business", notice: "send" });
  assert.ok(calls.logs.some((l) => l.event === "gemini_daily_cap_flag_failed" && l.level === "error"));
});

test("notice counter fails: no notice (never a duplicate), still flagged", async () => {
  const thrown = harness({ counts: { business: 4, global: 1 }, noticeThrows: true });
  assert.deepEqual(await rules.runDailyReplyLimit(thrown.deps, params("whatsapp")), {
    allowed: false,
    reason: "business",
    notice: "skip_notice_unknown",
  });
  assert.equal(thrown.calls.flags, 1);
  const nulled = harness({ counts: { business: 4, global: 1 }, noticeCounts: [null] });
  assert.equal((await rules.runDailyReplyLimit(nulled.deps, params("instagram"))).notice, "skip_notice_unknown");
});

test("late Meta delivery outside the 24-hour window: blocked, no notice", async () => {
  const { deps } = harness({ counts: { business: 4, global: 1 }, noticeCounts: [1] });
  const result = await rules.runDailyReplyLimit(deps, params("whatsapp", { inboundAtMs: NOW - DAY_MS - 60_000 }));
  assert.equal(result.notice, "skip_window_closed");
});

// ------------------------------------------------------------ structural

function between(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  return { start, end: source.indexOf(endNeedle, start) };
}

test("website: one shared check after the gates and before both model paths; no old fail-open counter", () => {
  const route = read("app/api/chat/route.ts");
  assert.doesNotMatch(route, /dailyCapVerdict|gemini_daily_business|incrementRateLimitCounter\("gemini_daily/);
  const check = route.indexOf("checkDailyReplyLimit({");
  assert.equal(route.split("checkDailyReplyLimit({").length - 1, 1, "called once");
  assert.ok(check > route.indexOf('if (conversation.control === "human")'), "after human control");
  assert.ok(check > route.indexOf("if (!agentServing)"), "after the serving gate");
  assert.ok(check > route.indexOf("if (inputAction.kind !== \"none\")"), "after the guardrail canned reply");
  assert.ok(check < route.indexOf("streamSalesEmployee("), "before streaming");
  assert.ok(check < route.indexOf("await askSalesEmployee("), "before JSON");
  const block = route.slice(check, route.indexOf("clientWantsStream(", check));
  assert.match(block, /if \(!dailyLimit\.allowed\) \{\s*return withCors\(/);
  assert.match(block, /answer: SOFT_LIMIT_MESSAGE/);
});

test("WhatsApp: after dedup and every gate, before the model; notice only when decided", () => {
  const route = read("app/api/webhooks/whatsapp/route.ts");
  assert.equal(route.split("checkDailyReplyLimit({").length - 1, 1);
  const check = route.indexOf("checkDailyReplyLimit({");
  assert.ok(route.indexOf('.from("whatsapp_inbound_messages")') < check, "dedup insert first (retries never count)");
  assert.ok(check > route.indexOf("if (inputAction.kind !== \"none\")"));
  assert.ok(check > route.indexOf("if (!isText)"), "non-text canned replies are not counted");
  assert.ok(check < route.indexOf("await askSalesEmployee("));
  const { start, end } = between(route, "if (!dailyLimit.allowed) {", "const history =");
  const block = route.slice(start, end);
  assert.match(block, /if \(dailyLimit\.notice !== "send"\) return "skipped";/);
  assert.match(block, /SOFT_LIMIT_MESSAGE/);
  assert.match(route, /inboundAtMs: whatsappTimestampToMs\(message\.timestamp\)/);
});

test("Instagram: after dedup and every gate, before the model; skipped status when no notice", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  assert.equal(route.split("checkDailyReplyLimit({").length - 1, 1);
  const check = route.indexOf("checkDailyReplyLimit({");
  assert.ok(route.indexOf('.from("instagram_inbound_messages")') < check);
  assert.ok(check > route.indexOf("if (inputAction.kind !== \"none\")"));
  assert.ok(check < route.indexOf("await askSalesEmployee("));
  assert.match(route, /inboundAtMs: inbound\.sentAtMs \?\? null/);
  assert.match(route, /if \(dailyLimit\.notice !== "send"\) return \{ outcome: "daily_limit", model: null, sent: null \};/);
  assert.match(route, /const noReplySent = outcome === "daily_limit" && sent === null;/);
});

test("the wrapper shares one pair of counters across channels and alerts once per day", () => {
  const wrapper = read("lib/daily-reply-limit.ts");
  assert.match(wrapper, /scope: "gemini_daily_business", identifier: businessId/);
  assert.match(wrapper, /scope: "gemini_daily_global", identifier: "all"/);
  assert.match(wrapper, /incrementRateLimitCounter\("gemini_cap_notice", conversationId, DAY_SECONDS\)/);
  const reached = wrapper.slice(wrapper.indexOf('event: "gemini_daily_cap_reached"'), wrapper.indexOf("alertCounterUnavailable"));
  assert.doesNotMatch(reached, /throttleKey/, "deduplicated by the counter crossing, not the per-process throttle");
});

test("migration adds the notice scope and keeps every existing scope", () => {
  const sql = read("supabase/migrations/20261124000100_daily_reply_limit_notice_scope.sql");
  assert.match(
    sql,
    /'admin_pii_reveal', 'business', 'gemini_daily_business', 'gemini_daily_global', 'gemini_cap_notice'\)\);/,
  );
  assert.match(read("lib/rate-limit.ts"), /\| "gemini_cap_notice";/);
});
