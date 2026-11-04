// Public-chat protection (production readiness item 3, 2026-11-03):
//   1. BEHAVIOURAL (pure, no network -- fetch is mocked):
//      - configuration parsing and defaults, malformed values, Turnstile off
//        unless both keys are set;
//      - the daily Gemini cap (per business, global, 0 = off, fail-open);
//      - Turnstile siteverify: success, invalid token, missing token, wrong
//        hostname, Cloudflare internal-error, network failure, non-JSON body,
//        and the request it sends (form body, remoteip, never logged);
//      - the off/log/enforce decision.
//   2. STRUCTURAL: the chat route wiring order, the new scopes fail open, the
//      migration, the widget iframe -> loader -> server token path, and that the
//      Phase 32 abuse scopes and guardrails are still LOG-ONLY.
//
// Run: npm run test:chat-protection
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const cp = await import(new URL("../lib/chat-protection.ts", import.meta.url).href);
const abuse = await import(new URL("../lib/abuse-limits.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

// ------------------------------------------------------------ config

test("defaults are the previous hard-coded limits; Turnstile is off", () => {
  const config = cp.chatProtectionConfigFromEnv({});
  assert.equal(config.ipLimit, 30);
  assert.equal(config.keyLimit, 120);
  assert.equal(config.conversationLimit, 20);
  assert.equal(config.businessLimit, 300);
  assert.equal(config.geminiDailyTurnsPerBusiness, 1000);
  assert.equal(config.geminiDailyTurnsGlobal, 5000, "round 3: overall default lowered to 5,000");
  assert.equal(config.turnstile.mode, "off");
});

test("configured values are used; malformed or out-of-range values fall back", () => {
  const config = cp.chatProtectionConfigFromEnv({
    CHAT_IP_LIMIT: "10",
    CHAT_KEY_LIMIT: "abc",
    CHAT_CONVERSATION_LIMIT: "0",
    CHAT_BUSINESS_LIMIT: " 500 ",
    GEMINI_DAILY_TURN_CAP_PER_BUSINESS: "0",
    GEMINI_DAILY_TURN_CAP_GLOBAL: "-5",
  });
  assert.equal(config.ipLimit, 10);
  assert.equal(config.keyLimit, 120, "not a number");
  assert.equal(config.conversationLimit, 20, "below the minimum of 1");
  assert.equal(config.businessLimit, 500);
  assert.equal(config.geminiDailyTurnsPerBusiness, 0, "0 = no cap is allowed");
  assert.equal(config.geminiDailyTurnsGlobal, 5000);
});

test("Turnstile is on only with a valid mode AND both keys", () => {
  const both = { TURNSTILE_SITE_KEY: "0x4AAA", TURNSTILE_SECRET_KEY: "0x4BBB" };
  assert.equal(cp.chatProtectionConfigFromEnv({ ...both, TURNSTILE_MODE: "enforce" }).turnstile.mode, "enforce");
  assert.equal(cp.chatProtectionConfigFromEnv({ ...both, TURNSTILE_MODE: "log" }).turnstile.mode, "log");
  assert.equal(cp.chatProtectionConfigFromEnv({ ...both, TURNSTILE_MODE: "block" }).turnstile.mode, "off");
  assert.equal(cp.chatProtectionConfigFromEnv({ TURNSTILE_MODE: "enforce", TURNSTILE_SITE_KEY: "x" }).turnstile.mode, "off");
  assert.equal(cp.chatProtectionConfigFromEnv({ TURNSTILE_MODE: "enforce", TURNSTILE_SECRET_KEY: "x" }).turnstile.mode, "off");
  assert.equal(
    cp.chatProtectionConfigFromEnv({ ...both, NEXT_PUBLIC_APP_URL: "https://aipilot.example.in" }).turnstile.expectedHostname,
    "aipilot.example.in",
  );
  assert.equal(cp.chatProtectionConfigFromEnv({ NEXT_PUBLIC_APP_URL: "not a url" }).turnstile.expectedHostname, null);
});

// The daily cap rules moved to lib/daily-reply-limit-rules.ts in round 3
// (every channel, fail-closed): scripts/run-daily-reply-limit-tests.mjs.

// ------------------------------------------------------------ Turnstile

function mockFetch(body, { throws = false, json = true } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (throws) throw new Error("network down");
    return { json: async () => (json ? body : JSON.parse("not json")) };
  };
  return { impl, calls };
}

const base = { secretKey: "secret_test", remoteIp: "203.0.113.9", expectedHostname: "app.example.in" };

test("Turnstile: a valid token on our hostname passes, and the request is a form POST to siteverify", async () => {
  const { impl, calls } = mockFetch({ success: true, hostname: "app.example.in", action: "widget_chat" });
  const result = await cp.verifyTurnstileToken({ ...base, token: "tok", fetchImpl: impl });
  assert.deepEqual(result, { ok: true, hostname: "app.example.in", action: "widget_chat" });
  assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(calls[0].init.method, "POST");
  const form = calls[0].init.body;
  assert.equal(form.get("secret"), "secret_test");
  assert.equal(form.get("response"), "tok");
  assert.equal(form.get("remoteip"), "203.0.113.9");
});

test("Turnstile: missing token, invalid token, wrong hostname", async () => {
  const none = mockFetch({});
  assert.equal((await cp.verifyTurnstileToken({ ...base, token: undefined, fetchImpl: none.impl })).reason, "missing_token");
  assert.equal(none.calls.length, 0, "no network call without a token");

  const invalid = await cp.verifyTurnstileToken({
    ...base,
    token: "tok",
    fetchImpl: mockFetch({ success: false, "error-codes": ["timeout-or-duplicate"] }).impl,
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid");
  assert.deepEqual(invalid.errorCodes, ["timeout-or-duplicate"]);

  const wrongHost = await cp.verifyTurnstileToken({
    ...base,
    token: "tok",
    fetchImpl: mockFetch({ success: true, hostname: "evil.example.com" }).impl,
  });
  assert.equal(wrongHost.reason, "hostname_mismatch");

  const noExpectation = await cp.verifyTurnstileToken({
    ...base,
    expectedHostname: null,
    token: "tok",
    fetchImpl: mockFetch({ success: true, hostname: "anything.example" }).impl,
  });
  assert.equal(noExpectation.ok, true, "hostname not checked when NEXT_PUBLIC_APP_URL is unset");
});

test("Turnstile: Cloudflare failures are 'unavailable', never a throw", async () => {
  const internal = await cp.verifyTurnstileToken({
    ...base,
    token: "tok",
    fetchImpl: mockFetch({ success: false, "error-codes": ["internal-error"] }).impl,
  });
  assert.equal(internal.reason, "unavailable");
  const network = await cp.verifyTurnstileToken({ ...base, token: "tok", fetchImpl: mockFetch({}, { throws: true }).impl });
  assert.equal(network.reason, "unavailable");
  const notJson = await cp.verifyTurnstileToken({ ...base, token: "tok", fetchImpl: mockFetch({}, { json: false }).impl });
  assert.equal(notJson.reason, "unavailable");
  const unknownIp = mockFetch({ success: true });
  await cp.verifyTurnstileToken({ ...base, remoteIp: "unknown", token: "tok", fetchImpl: unknownIp.impl });
  assert.equal(unknownIp.calls[0].init.body.get("remoteip"), null, "the 'unknown' IP sentinel is not sent");
});

test("Turnstile decision: off/log never block; enforce blocks bad tokens but not a Cloudflare outage", () => {
  const bad = { ok: false, reason: "invalid", errorCodes: [], hostname: null };
  const missing = { ok: false, reason: "missing_token", errorCodes: [], hostname: null };
  const wrongHost = { ok: false, reason: "hostname_mismatch", errorCodes: [], hostname: "x" };
  const outage = { ok: false, reason: "unavailable", errorCodes: [], hostname: null };
  const good = { ok: true, hostname: "app", action: null };
  for (const result of [bad, missing, wrongHost, outage, good]) {
    assert.equal(cp.turnstileDecision("off", result), "allow");
    assert.equal(cp.turnstileDecision("log", result), "allow");
  }
  assert.equal(cp.turnstileDecision("enforce", bad), "reject");
  assert.equal(cp.turnstileDecision("enforce", missing), "reject");
  assert.equal(cp.turnstileDecision("enforce", wrongHost), "reject");
  assert.equal(cp.turnstileDecision("enforce", outage), "allow");
  assert.equal(cp.turnstileDecision("enforce", good), "allow");
  assert.equal(cp.turnstileDecision("enforce", null), "allow", "not checked (existing conversation)");
});

// ------------------------------------------------------------ verdicts

test("business scope enforces and fails open; daily caps fail closed; Phase 32 abuse scopes stay log-only", () => {
  assert.deepEqual(abuse.resolveAbuseLimitVerdict("business", 11, 10), { allowed: false, wouldExceed: false });
  assert.deepEqual(abuse.resolveAbuseLimitVerdict("business", null, 10), { allowed: true, wouldExceed: false });
  for (const scope of ["gemini_daily_business", "gemini_daily_global"]) {
    assert.deepEqual(abuse.resolveAbuseLimitVerdict(scope, 11, 10), { allowed: false, wouldExceed: false }, `${scope} enforces`);
    assert.deepEqual(abuse.resolveAbuseLimitVerdict(scope, null, 10), { allowed: false, wouldExceed: false }, `${scope} fails closed (round 3)`);
  }
  assert.deepEqual(abuse.resolveAbuseLimitVerdict("ip", null, 10), { allowed: false, wouldExceed: false }, "ip still fails closed");
  for (const scope of ["business_burst", "new_conversation_ip", "ip_subnet"]) {
    assert.ok(abuse.LOG_ONLY_SCOPES.has(scope), `${scope} still log-only (owner decision)`);
  }
  const guardrails = read("lib/guardrails/config.ts");
  for (const check of ["injection", "abuse", "output_contacts", "output_promise"]) {
    assert.match(guardrails, new RegExp(`${check}: "log_only"`), `${check} still log-only`);
  }
});

// ------------------------------------------------------------ structural

test("chat route: limits come from config; per-business limit with the key limit; Turnstile only for a new conversation, before the embedding", () => {
  const route = read("app/api/chat/route.ts");
  assert.doesNotMatch(route, /const IP_LIMIT = 30;/);
  assert.match(route, /const protection = chatProtectionConfigFromEnv\(\);/);
  assert.match(route, /checkAndIncrementRateLimit\("business", business\.businessId, protection\.businessLimit, RATE_LIMIT_WINDOW_SECONDS\)/);
  const turnstile = route.indexOf("verifyTurnstileToken({");
  assert.ok(turnstile > route.indexOf('checkAndIncrementRateLimit("key"'), "after the key/business limits");
  assert.ok(turnstile < route.indexOf("embedQueryWithCache(supabase"), "before any Gemini call");
  assert.match(route, /if \(!conversationId && protection\.turnstile\.mode !== "off" && protection\.turnstile\.secretKey\)/);
  assert.match(route, /if \(decision === "reject"\) \{\s*return withCors\(jsonError\("Please refresh the page and try again\.", 403\)\);/);
});

test("ops alerts are throttled: error + email once per window, info after", () => {
  const alert = read("lib/ops-alert.ts");
  assert.ok(alert.indexOf('{ ...factsForLog, throttled: true }, "info"') < alert.indexOf('logEvent(params.event, params.businessId, factsForLog, "error")'));
});

test("migration adds exactly the three scopes; the daily window survives the 1-day cleanup", () => {
  const sql = read("supabase/migrations/20261123000000_chat_protection_rate_limit_scopes.sql");
  assert.match(sql, /'admin_pii_reveal', 'business', 'gemini_daily_business', 'gemini_daily_global'\)\);/);
  assert.match(read("supabase/migrations/20260820221000_schedule_operational_table_cleanup.sql"), /window_start < now\(\) - interval '1 day'/);
  assert.equal(cp.DAY_SECONDS, 86400);
});

test("token path: iframe -> loader -> server; secret never reaches the client", () => {
  const chat = read("app/(widget)/widget/embed/_lib/use-widget-chat.ts");
  assert.match(chat, /\.\.\.\(turnstileToken \? \{ turnstileToken \} : \{\}\)/);
  const loader = read("public/widget-loader.js");
  assert.match(loader, /handleSend\(data\.requestId, data\.text, data\.consentGiven, data\.suggested, data\.turnstileToken\)/);
  assert.match(loader, /turnstileToken: typeof turnstileToken === "string" && turnstileToken\.length <= 2048 \? turnstileToken : undefined/);
  const page = read("app/(widget)/widget/embed/page.tsx");
  assert.match(page, /protection\.turnstile\.mode !== "off" \? protection\.turnstile\.siteKey : null/);
  assert.doesNotMatch(page, /secretKey/);
  for (const file of ["app/(widget)/widget/embed/_lib/use-turnstile.ts", "app/(widget)/widget/embed/_components/widget-app.tsx"]) {
    assert.doesNotMatch(read(file), /SECRET/i, file);
  }
  assert.match(read("app/(widget)/widget/embed/_lib/use-turnstile.ts"), /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(read("lib/schemas/widget-chat-request.ts"), /turnstileToken: z\.string\(\)\.min\(1\)\.max\(2048\)\.optional\(\)/);
});
