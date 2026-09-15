// Unit tests for the pure Copilot Action Lifecycle rules
// (lib/copilot-lifecycle.ts) -- Node's built-in test runner + assert, no
// new dependency (this project has no JS unit-test framework installed;
// `node:test`/`node:assert` are part of the Node runtime already in use
// by scripts/run-pgtap-tests.mjs and friends). These are pure functions
// (no Supabase, no Next.js, no AI call) -- see this module's own doc
// comment for why it's importable directly like this.
//
// `@/lib/...` alias resolution (a Next.js/webpack/tsconfig convention,
// meaningless to plain Node) is handled by scripts/alias-resolver-hooks.mjs,
// registered below -- no source file is touched to make this runnable.
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const {
  computePriority,
  deriveDesiredAction,
  isSuppressedByDismissal,
  isActionSuppressedByHistory,
  isSnoozeDue,
  decideReconciliation,
  computeSnoozeUntil,
  DISMISSAL_EXPIRY_DAYS,
  COPILOT_ACTION_EXPIRY_DAYS,
} = await import(new URL("../lib/copilot-lifecycle.ts", import.meta.url).href);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-15T12:00:00.000Z");

function baseCustomer(overrides = {}) {
  return {
    id: "cust-1",
    displayName: "Test Customer",
    email: null,
    phone: null,
    firstSeenAt: new Date(NOW - 30 * DAY_MS).toISOString(),
    lastActivityAt: new Date(NOW).toISOString(),
    latestLead: null,
    latestChannel: null,
    needsAttention: false,
    humanControlled: false,
    conversationCount: 1,
    appointmentCount: 0,
    latestAppointmentStatus: null,
    latestAppointmentStartsAt: null,
    tagNames: [],
    ...overrides,
  };
}

// --- computePriority / deriveDesiredAction: action-type mapping ---

test("needs_attention maps to reply_to_prospect and outranks everything else", () => {
  const customer = baseCustomer({ needsAttention: true, latestLead: { id: "l1", score: 1, qualification: "cold", status: "new", interestType: null } });
  const desired = deriveDesiredAction(customer, NOW);
  assert.equal(desired.actionType, "reply_to_prospect");
  assert.equal(desired.recommendedAction, "Review and respond");
  assert.ok(desired.reasons.some((r) => r.key === "needs_attention"));
});

test("a pending appointment maps to confirm_appointment", () => {
  const customer = baseCustomer({ latestAppointmentStatus: "pending" });
  const desired = deriveDesiredAction(customer, NOW);
  assert.equal(desired.actionType, "confirm_appointment");
  assert.equal(desired.recommendedAction, "Confirm or decline the appointment");
});

test("a confirmed appointment within 24h also maps to confirm_appointment", () => {
  const customer = baseCustomer({
    latestAppointmentStatus: "confirmed",
    latestAppointmentStartsAt: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
  });
  const desired = deriveDesiredAction(customer, NOW);
  assert.equal(desired.actionType, "confirm_appointment");
  assert.equal(desired.recommendedAction, "Confirm attendance");
});

test("a stalled open lead maps to review_stalled_conversation", () => {
  const customer = baseCustomer({
    latestLead: { id: "l1", score: 2, qualification: "warm", status: "new", interestType: null },
    lastActivityAt: new Date(NOW - 72 * 60 * 60 * 1000).toISOString(),
  });
  const desired = deriveDesiredAction(customer, NOW);
  assert.equal(desired.actionType, "review_stalled_conversation");
});

test("a hot lead with no appointment maps to follow_up", () => {
  const customer = baseCustomer({ latestLead: { id: "l1", score: 9, qualification: "hot", status: "new", interestType: null } });
  const desired = deriveDesiredAction(customer, NOW);
  assert.equal(desired.actionType, "follow_up");
  assert.equal(desired.recommendedAction, "Follow up and offer a consultation");
});

test("no signal at all yields no desired action (priority 0)", () => {
  const desired = deriveDesiredAction(baseCustomer(), NOW);
  assert.equal(desired, null);
});

test("computePriority()'s output shape is unchanged from v1 (no actionType leaks into it)", () => {
  const customer = baseCustomer({ needsAttention: true });
  const result = computePriority(customer, NOW);
  assert.deepEqual(Object.keys(result).sort(), ["priority", "reasons", "recommendedAction"]);
});

// --- v1 dismissal suppression (isSuppressedByDismissal) -- unchanged behavior ---

test("dismissal: same reasons, under 7 days -> suppressed", () => {
  const reasons = [{ key: "lead_score", label: "Lead score 5/9", weight: 25 }];
  const dismissal = { reason_keys: ["lead_score"], dismissed_at: new Date(NOW - 2 * DAY_MS).toISOString() };
  assert.equal(isSuppressedByDismissal(reasons, dismissal, NOW), true);
});

test("dismissal: exactly at the 7-day boundary is not yet expired, older than it is", () => {
  const reasons = [{ key: "lead_score", label: "Lead score 5/9", weight: 25 }];
  const justUnder = { reason_keys: ["lead_score"], dismissed_at: new Date(NOW - (DISMISSAL_EXPIRY_DAYS * DAY_MS - 1000)).toISOString() };
  const justOver = { reason_keys: ["lead_score"], dismissed_at: new Date(NOW - (DISMISSAL_EXPIRY_DAYS * DAY_MS + 1000)).toISOString() };
  assert.equal(isSuppressedByDismissal(reasons, justUnder, NOW), true);
  assert.equal(isSuppressedByDismissal(reasons, justOver, NOW), false);
});

test("dismissal: a genuinely new reason key resurfaces immediately, even 1 minute old", () => {
  const reasons = [
    { key: "lead_score", label: "Lead score 5/9", weight: 25 },
    { key: "needs_attention", label: "Conversation needs attention", weight: 50 },
  ];
  const dismissal = { reason_keys: ["lead_score"], dismissed_at: new Date(NOW - 60 * 1000).toISOString() };
  assert.equal(isSuppressedByDismissal(reasons, dismissal, NOW), false);
});

test("dismissal: no dismissal at all -> never suppressed", () => {
  assert.equal(isSuppressedByDismissal([{ key: "stalled", label: "x", weight: 20 }], undefined, NOW), false);
});

// --- v2 history suppression (isActionSuppressedByHistory) ---

test("history: dismissed terminal state follows the same 7-day rule as v1", () => {
  const desiredKeys = ["lead_score"];
  const recent = { status: "dismissed", reasonKeys: ["lead_score"], dismissedAt: new Date(NOW - DAY_MS).toISOString() };
  const old = { status: "dismissed", reasonKeys: ["lead_score"], dismissedAt: new Date(NOW - 8 * DAY_MS).toISOString() };
  assert.equal(isActionSuppressedByHistory(desiredKeys, recent, NOW), true);
  assert.equal(isActionSuppressedByHistory(desiredKeys, old, NOW), false);
});

test("history: completed terminal state has NO time expiry -- same reasons stay suppressed indefinitely", () => {
  const desiredKeys = ["lead_score"];
  const veryOld = { status: "completed", reasonKeys: ["lead_score"], dismissedAt: null };
  assert.equal(isActionSuppressedByHistory(desiredKeys, veryOld, NOW - 400 * DAY_MS), true);
  assert.equal(isActionSuppressedByHistory(desiredKeys, veryOld, NOW), true);
});

test("history: completed action does not return to Today when nothing new happened (decideReconciliation)", () => {
  const decision = decideReconciliation(
    ["lead_score"],
    { status: "completed", reasonKeys: ["lead_score"], snoozedUntil: null, dismissedAt: null, createdAt: new Date(NOW - 2 * DAY_MS).toISOString() },
    NOW,
  );
  assert.deepEqual(decision, { op: "keep_suppressed" });
});

test("history: superseded action does not return to Today when nothing new happened", () => {
  const decision = decideReconciliation(
    ["appointment_pending"],
    { status: "superseded", reasonKeys: ["appointment_pending"], snoozedUntil: null, dismissedAt: null, createdAt: new Date(NOW - 3 * DAY_MS).toISOString() },
    NOW,
  );
  assert.deepEqual(decision, { op: "keep_suppressed" });
});

test("history: a genuinely new reason key reopens a completed/superseded/dismissed action", () => {
  for (const status of ["completed", "superseded", "dismissed", "expired"]) {
    const decision = decideReconciliation(
      ["lead_score", "stalled"],
      { status, reasonKeys: ["lead_score"], snoozedUntil: null, dismissedAt: status === "dismissed" ? new Date(NOW - 60_000).toISOString() : null, createdAt: new Date(NOW - DAY_MS).toISOString() },
      NOW,
    );
    assert.deepEqual(decision, { op: "reopen" }, `expected reopen for terminal status "${status}"`);
  }
});

// --- Reconciliation decision table (section 26's required cases) ---

test("reconciliation: no existing row -> create", () => {
  assert.deepEqual(decideReconciliation(["stalled"], undefined, NOW), { op: "create" });
});

test("reconciliation: existing open row -> update (never a duplicate create)", () => {
  const existing = { status: "open", reasonKeys: ["stalled"], snoozedUntil: null, dismissedAt: null, createdAt: new Date(NOW - DAY_MS).toISOString() };
  assert.deepEqual(decideReconciliation(["stalled"], existing, NOW), { op: "update" });
});

test("reconciliation: same customer + action type, called repeatedly, never creates more than once (idempotency)", () => {
  let existing;
  const decisions = [];
  for (let i = 0; i < 5; i += 1) {
    const decision = decideReconciliation(["stalled"], existing, NOW);
    decisions.push(decision.op);
    if (decision.op === "create") existing = { status: "open", reasonKeys: ["stalled"], snoozedUntil: null, dismissedAt: null, createdAt: new Date(NOW).toISOString() };
  }
  assert.deepEqual(decisions, ["create", "update", "update", "update", "update"]);
});

test("reconciliation: snoozed before its due time is hidden from Today (keep_snoozed)", () => {
  const existing = { status: "snoozed", reasonKeys: ["stalled"], snoozedUntil: new Date(NOW + DAY_MS).toISOString(), dismissedAt: null, createdAt: new Date(NOW - DAY_MS).toISOString() };
  assert.deepEqual(decideReconciliation(["stalled"], existing, NOW), { op: "keep_snoozed" });
});

test("reconciliation: snoozed at/after its due time wakes back to open", () => {
  const dueExactly = { status: "snoozed", reasonKeys: ["stalled"], snoozedUntil: new Date(NOW).toISOString(), dismissedAt: null, createdAt: new Date(NOW - DAY_MS).toISOString() };
  const overdue = { status: "snoozed", reasonKeys: ["stalled"], snoozedUntil: new Date(NOW - 60_000).toISOString(), dismissedAt: null, createdAt: new Date(NOW - DAY_MS).toISOString() };
  assert.deepEqual(decideReconciliation(["stalled"], dueExactly, NOW), { op: "wake" });
  assert.deepEqual(decideReconciliation(["stalled"], overdue, NOW), { op: "wake" });
});

test("reconciliation: an open row past COPILOT_ACTION_EXPIRY_DAYS expires instead of updating", () => {
  const stale = {
    status: "open",
    reasonKeys: ["stalled"],
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date(NOW - (COPILOT_ACTION_EXPIRY_DAYS * DAY_MS + DAY_MS)).toISOString(),
  };
  assert.deepEqual(decideReconciliation(["stalled"], stale, NOW), { op: "expire" });
});

test("reconciliation: an open row just under COPILOT_ACTION_EXPIRY_DAYS still updates", () => {
  const fresh = {
    status: "open",
    reasonKeys: ["stalled"],
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date(NOW - (COPILOT_ACTION_EXPIRY_DAYS * DAY_MS - DAY_MS)).toISOString(),
  };
  assert.deepEqual(decideReconciliation(["stalled"], fresh, NOW), { op: "update" });
});

// --- isSnoozeDue ---

test("isSnoozeDue: future timestamp is not due, past/now timestamp is due", () => {
  assert.equal(isSnoozeDue(new Date(NOW + 1000).toISOString(), NOW), false);
  assert.equal(isSnoozeDue(new Date(NOW).toISOString(), NOW), true);
  assert.equal(isSnoozeDue(new Date(NOW - 1000).toISOString(), NOW), true);
});

// --- computeSnoozeUntil ---

test("computeSnoozeUntil: later_today is a fixed relative offset ahead of now", () => {
  const result = Date.parse(computeSnoozeUntil("later_today", NOW, "UTC"));
  assert.ok(result > NOW);
  assert.ok(result <= NOW + 6 * 60 * 60 * 1000);
});

test("computeSnoozeUntil: tomorrow/next_week land on a later calendar day in the given timezone", () => {
  const tomorrow = Date.parse(computeSnoozeUntil("tomorrow", NOW, "America/New_York"));
  const nextWeek = Date.parse(computeSnoozeUntil("next_week", NOW, "America/New_York"));
  assert.ok(tomorrow > NOW);
  assert.ok(nextWeek > tomorrow);
  // Roughly a week apart -- generous window instead of exact ms to avoid coupling to DST arithmetic.
  assert.ok(nextWeek - tomorrow > 5 * DAY_MS && nextWeek - tomorrow < 9 * DAY_MS);
});

test("computeSnoozeUntil: same preset produces the same instant regardless of a distinct-but-equivalent UTC offset input", () => {
  const a = computeSnoozeUntil("tomorrow", NOW, "UTC");
  const b = computeSnoozeUntil("tomorrow", NOW, "UTC");
  assert.equal(a, b);
});
