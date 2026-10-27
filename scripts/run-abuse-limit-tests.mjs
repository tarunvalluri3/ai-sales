// Unit tests for the Phase 32 abuse rate-limit logic (STATE.md): the pure
// core in lib/abuse-limits.ts -- limit selection per subscription status, the
// log-only / fail-open verdict, the IPv4 /24 derivation (including the IPv6
// skip), and the new-conversation predicate. Node's built-in test runner +
// assert, same approach as scripts/run-chat-perf-tests.mjs. The module is
// pure (no server-only, no I/O), so it imports directly through the same @/*
// alias resolver the other suites use -- which is exactly why this logic
// lives in lib/abuse-limits.ts rather than in the server-only lib/rate-limit.ts.
//
// Run: npm run test:abuse-limits
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const {
  SCOPE_LIMITS,
  LOG_ONLY_SCOPES,
  FAIL_OPEN_SCOPES,
  selectBurstLimit,
  resolveAbuseLimitVerdict,
  deriveIpv4Subnet,
  requiresNewConversationCheck,
  ABUSE_SCOPE_TIER,
  resolveAbuseResponse,
  SOFT_LIMIT_MESSAGE,
  CLIENT_TOO_FAST_MS,
  classifyClientSignal,
  effectiveNewConversationLimit,
  secondsUntilWindowEnd,
} = await import(new URL("../lib/abuse-limits.ts", import.meta.url).href);

const { findDuplicateSubmitReply, normalizeSubmitText, DUPLICATE_SUBMIT_WINDOW_MS } = await import(
  new URL("../lib/duplicate-submit.ts", import.meta.url).href
);

test("selectBurstLimit picks the tighter trial profile only for a trialing tenant", () => {
  assert.deepEqual(selectBurstLimit("trialing"), SCOPE_LIMITS.business_burst_trial);
  for (const status of ["active", "past_due", "cancelled", "expired"]) {
    assert.deepEqual(selectBurstLimit(status), SCOPE_LIMITS.business_burst, `status ${status} uses the normal profile`);
  }
});

test("the trial burst ceiling is strictly tighter than the normal one, same window", () => {
  assert.ok(SCOPE_LIMITS.business_burst_trial.limit < SCOPE_LIMITS.business_burst.limit);
  assert.equal(SCOPE_LIMITS.business_burst_trial.windowSeconds, SCOPE_LIMITS.business_burst.windowSeconds);
});

test("the three new scopes are all log-only and all fail open", () => {
  for (const scope of ["business_burst", "new_conversation_ip", "ip_subnet"]) {
    assert.ok(LOG_ONLY_SCOPES.has(scope), `${scope} is log-only`);
    assert.ok(FAIL_OPEN_SCOPES.has(scope), `${scope} fails open`);
  }
  // Pre-existing scopes stay fail-closed and enforcing (not in either set).
  for (const scope of ["ip", "key", "conversation", "whatsapp_webhook", "instagram_webhook"]) {
    assert.ok(!LOG_ONLY_SCOPES.has(scope), `${scope} is not log-only`);
    assert.ok(!FAIL_OPEN_SCOPES.has(scope), `${scope} is not fail-open`);
  }
});

test("resolveAbuseLimitVerdict: a log-only scope over its limit is allowed but flagged wouldExceed", () => {
  const verdict = resolveAbuseLimitVerdict("business_burst", 151, 150);
  assert.deepEqual(verdict, { allowed: true, wouldExceed: true });
});

test("resolveAbuseLimitVerdict: at or under the limit is allowed and not flagged", () => {
  assert.deepEqual(resolveAbuseLimitVerdict("ip_subnet", 150, 150), { allowed: true, wouldExceed: false });
  assert.deepEqual(resolveAbuseLimitVerdict("ip_subnet", 1, 150), { allowed: true, wouldExceed: false });
});

test("resolveAbuseLimitVerdict: infra error fails OPEN for an abuse scope, CLOSED for a pre-existing one", () => {
  assert.deepEqual(resolveAbuseLimitVerdict("business_burst", null, 150), { allowed: true, wouldExceed: false });
  // A pre-existing scope is not in FAIL_OPEN_SCOPES, so a null (error) count
  // refuses the request -- the unchanged fail-closed behaviour.
  assert.deepEqual(resolveAbuseLimitVerdict("ip", null, 30), { allowed: false, wouldExceed: false });
});

test("resolveAbuseLimitVerdict: a pre-existing scope over its limit is refused, not merely flagged", () => {
  assert.deepEqual(resolveAbuseLimitVerdict("conversation", 21, 20), { allowed: false, wouldExceed: false });
});

test("deriveIpv4Subnet returns the /24 for a dotted-quad IPv4", () => {
  assert.equal(deriveIpv4Subnet("203.0.113.47"), "203.0.113.0/24");
  assert.equal(deriveIpv4Subnet("10.0.0.0"), "10.0.0.0/24");
  assert.equal(deriveIpv4Subnet("255.255.255.255"), "255.255.255.0/24");
});

test("deriveIpv4Subnet skips an IPv6 address (returns null), so the caller skips the check", () => {
  assert.equal(deriveIpv4Subnet("2001:db8::1"), null);
  assert.equal(deriveIpv4Subnet("::1"), null);
  assert.equal(deriveIpv4Subnet("fe80::1ff:fe23:4567:890a"), null);
});

test("deriveIpv4Subnet rejects the unknown sentinel and malformed values", () => {
  assert.equal(deriveIpv4Subnet("unknown"), null);
  assert.equal(deriveIpv4Subnet("203.0.113"), null);
  assert.equal(deriveIpv4Subnet("203.0.113.256"), null);
  assert.equal(deriveIpv4Subnet("203.0.113.1e2"), null);
  assert.equal(deriveIpv4Subnet("203.0.113. 1"), null);
  assert.equal(deriveIpv4Subnet(""), null);
});

test("requiresNewConversationCheck fires only when there is no conversationId", () => {
  assert.equal(requiresNewConversationCheck(undefined), true);
  assert.equal(requiresNewConversationCheck(null), true);
  assert.equal(requiresNewConversationCheck(""), true);
  assert.equal(requiresNewConversationCheck("c1b2a3d4-0000-0000-0000-000000000000"), false);
});

// --- Stage C: duplicate-submit guard (lib/duplicate-submit.ts) ---

test("normalizeSubmitText trims, collapses whitespace and lowercases", () => {
  assert.equal(normalizeSubmitText("  Return   Policy "), "return policy");
  assert.equal(normalizeSubmitText("DO YOU SHIP?"), "do you ship?");
});

const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString();

test("findDuplicateSubmitReply replays the stored reply for an identical re-post within the window", () => {
  const history = [
    { role: "user", content: "What is your return policy?", created_at: at(5) },
    { role: "assistant", content: "You can return items within 30 days.", created_at: at(4) },
  ];
  // Case-/whitespace-insensitive match of the same question.
  const replay = findDuplicateSubmitReply("  what is your RETURN policy? ", history, NOW);
  assert.deepEqual(replay, { answer: "You can return items within 30 days." });
});

test("findDuplicateSubmitReply does NOT replay a genuine re-ask outside the 60s window", () => {
  const history = [
    { role: "user", content: "What is your return policy?", created_at: at(120) },
    { role: "assistant", content: "You can return items within 30 days.", created_at: at(119) },
  ];
  assert.equal(findDuplicateSubmitReply("What is your return policy?", history, NOW), null);
});

test("findDuplicateSubmitReply window boundary: exactly 60s replays, just over does not", () => {
  const mk = (secondsAgo) => [
    { role: "user", content: "hi", created_at: at(secondsAgo) },
    { role: "assistant", content: "Hello!", created_at: at(secondsAgo) },
  ];
  assert.deepEqual(findDuplicateSubmitReply("hi", mk(DUPLICATE_SUBMIT_WINDOW_MS / 1000), NOW), { answer: "Hello!" });
  assert.equal(findDuplicateSubmitReply("hi", mk(DUPLICATE_SUBMIT_WINDOW_MS / 1000 + 0.001), NOW), null);
});

test("findDuplicateSubmitReply does NOT replay when the question has no assistant answer yet", () => {
  // The last message is the user's own just-written turn, no assistant after it.
  const history = [
    { role: "assistant", content: "Earlier answer.", created_at: at(30) },
    { role: "user", content: "a brand new question", created_at: at(2) },
  ];
  assert.equal(findDuplicateSubmitReply("a brand new question", history, NOW), null);
});

test("findDuplicateSubmitReply does NOT replay a different question", () => {
  const history = [
    { role: "user", content: "What is your return policy?", created_at: at(5) },
    { role: "assistant", content: "30 days.", created_at: at(4) },
  ];
  assert.equal(findDuplicateSubmitReply("do you offer same-day delivery?", history, NOW), null);
});

test("findDuplicateSubmitReply returns null without a usable timestamp or for an empty question", () => {
  const noTs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hello!" },
  ];
  assert.equal(findDuplicateSubmitReply("hi", noTs, NOW), null);
  assert.equal(findDuplicateSubmitReply("   ", [], NOW), null);
});

test("Stage D tiers: the IP-keyed scopes are hard (429), business_burst is soft", () => {
  assert.equal(ABUSE_SCOPE_TIER.ip_subnet, "hard");
  assert.equal(ABUSE_SCOPE_TIER.new_conversation_ip, "hard");
  assert.equal(ABUSE_SCOPE_TIER.business_burst, "soft");
});

test("resolveAbuseResponse: allowed always proceeds; a refusal maps to the scope's tier", () => {
  for (const scope of Object.keys(ABUSE_SCOPE_TIER)) {
    assert.equal(resolveAbuseResponse(scope, true), "proceed");
  }
  assert.equal(resolveAbuseResponse("ip_subnet", false), "reject_429");
  assert.equal(resolveAbuseResponse("new_conversation_ip", false), "reject_429");
  assert.equal(resolveAbuseResponse("business_burst", false), "soft_reply");
});

test("while log-only, no abuse scope can ever yield a non-proceed response (Stage D is dormant)", () => {
  for (const scope of Object.keys(ABUSE_SCOPE_TIER)) {
    const verdict = resolveAbuseLimitVerdict(scope, 1_000_000, 1);
    assert.equal(verdict.allowed, true);
    assert.equal(resolveAbuseResponse(scope, verdict.allowed), "proceed");
  }
});

test("the soft-limit message is fixed text that promises nothing about the business", () => {
  assert.ok(SOFT_LIMIT_MESSAGE.length > 0 && SOFT_LIMIT_MESSAGE.length < 300);
  assert.ok(!/[$₹]|price|refund|discount/i.test(SOFT_LIMIT_MESSAGE));
});

test("new_conversation_ip is 30/h so a shared office or carrier IP is not tripped by a few real visitors", () => {
  assert.equal(SCOPE_LIMITS.new_conversation_ip.limit, 30);
  assert.equal(SCOPE_LIMITS.new_conversation_ip.windowSeconds, 3600);
});

test("classifyClientSignal: under the threshold is too_fast, at or over is ok", () => {
  assert.equal(classifyClientSignal(0), "too_fast");
  assert.equal(classifyClientSignal(CLIENT_TOO_FAST_MS - 1), "too_fast");
  assert.equal(classifyClientSignal(CLIENT_TOO_FAST_MS), "ok");
  assert.equal(classifyClientSignal(45_000), "ok");
});

test("classifyClientSignal: a missing or malformed value is unreported, never penalised", () => {
  for (const v of [undefined, null, NaN, Infinity, -5]) {
    assert.equal(classifyClientSignal(v), "unreported");
  }
});

test("effectiveNewConversationLimit only ever tightens, and only for too_fast", () => {
  const base = SCOPE_LIMITS.new_conversation_ip.limit;
  assert.equal(effectiveNewConversationLimit("ok"), base);
  assert.equal(effectiveNewConversationLimit("unreported"), base);
  assert.equal(effectiveNewConversationLimit("too_fast"), Math.ceil(base / 2));
  assert.ok(effectiveNewConversationLimit("too_fast") < base);
});

test("secondsUntilWindowEnd: exact seconds to the epoch-aligned window boundary", () => {
  // 300s windows: 100s into a window leaves 200s.
  assert.equal(secondsUntilWindowEnd(1_000_000 * 300 * 1000 + 100_000, 300), 200);
  // Exactly on a boundary starts a fresh full window.
  assert.equal(secondsUntilWindowEnd(1_000_000 * 300 * 1000, 300), 300);
});

test("secondsUntilWindowEnd rounds up and never returns less than 1", () => {
  assert.equal(secondsUntilWindowEnd(1_000_000 * 300 * 1000 + 299_500, 300), 1);
  assert.equal(secondsUntilWindowEnd(1_000_000 * 300 * 1000 + 299_999, 300), 1);
  for (let ms = 0; ms < 5000; ms += 137) {
    const v = secondsUntilWindowEnd(1_700_000_000_000 + ms, 3600);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 3600);
  }
});
