// Appointment reminder and expiry tests (production readiness item 5;
// LAUNCH_AUDIT.md §2, blocker B6).
//
//   1. BEHAVIOURAL (pure): when the 24 h and 1 h reminders are due (window
//      edges, never both at once, never after the start, independent of time
//      zone / DST because they use absolute instants); when a pending booking
//      expires (48 h after booking or 2 h before start, with the short-notice
//      floor); the candidate range the sweep reads.
//   2. STRUCTURAL: every notice claims its dedup ledger row BEFORE sending and
//      skips when it didn't get it (no duplicate reminders); labels use the
//      business's own time zone; expiry notifies prospect + owner, fires the
//      workflow and supersedes the Copilot task; the job is scheduled; the SQL
//      formula matches the TypeScript one; the new table's RLS posture.
//
// Run: npm run test:appointment-lifecycle
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/appointment-lifecycle-rules.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date("2026-11-10T09:30:00Z"); // 15:00 IST
const before = (ms) => new Date(START.getTime() - ms);

// ------------------------------------------------------------- reminders

test("24 h reminder: due from 24 h before until 20 h before", () => {
  assert.deepEqual(rules.dueReminderKinds(START, before(24 * HOUR)), ["reminder_24h"]);
  assert.deepEqual(rules.dueReminderKinds(START, before(22 * HOUR)), ["reminder_24h"]);
  assert.deepEqual(rules.dueReminderKinds(START, before(20 * HOUR + MIN)), ["reminder_24h"]);
  assert.deepEqual(rules.dueReminderKinds(START, before(20 * HOUR)), [], "window closed");
  assert.deepEqual(rules.dueReminderKinds(START, before(24 * HOUR + MIN)), [], "not yet");
});

test("1 h reminder: due from 60 min before until 15 min before", () => {
  assert.deepEqual(rules.dueReminderKinds(START, before(60 * MIN)), ["reminder_1h"]);
  assert.deepEqual(rules.dueReminderKinds(START, before(30 * MIN)), ["reminder_1h"]);
  assert.deepEqual(rules.dueReminderKinds(START, before(15 * MIN)), [], "too close to send");
  assert.deepEqual(rules.dueReminderKinds(START, before(2 * HOUR)), []);
});

test("never both at once, never at or after the start", () => {
  for (let m = 0; m <= 25 * 60; m += 5) {
    assert.ok(rules.dueReminderKinds(START, before(m * MIN)).length <= 1, `at -${m}m`);
  }
  assert.deepEqual(rules.dueReminderKinds(START, START), []);
  assert.deepEqual(rules.dueReminderKinds(START, new Date(START.getTime() + HOUR)), []);
});

test("an appointment confirmed 5 hours ahead gets only the 1 h reminder", () => {
  const confirmedAt = before(5 * HOUR);
  assert.deepEqual(rules.dueReminderKinds(START, confirmedAt), []);
  assert.deepEqual(rules.dueReminderKinds(START, before(55 * MIN)), ["reminder_1h"]);
});

test("reminders use absolute instants: a DST change between now and the start doesn't shift them", () => {
  // US DST ended 2026-11-01 06:00 UTC. An appointment at 2026-11-01 15:00 UTC
  // (10:00 New York, after the change) is still reminded exactly 24 h / 1 h
  // before in real elapsed time.
  const start = new Date("2026-11-01T15:00:00Z");
  assert.deepEqual(rules.dueReminderKinds(start, new Date("2026-10-31T15:00:00Z")), ["reminder_24h"]);
  assert.deepEqual(rules.dueReminderKinds(start, new Date("2026-11-01T14:00:00Z")), ["reminder_1h"]);
});

test("the sweep reads starts_at in (now + 15 min, now + 24 h]", () => {
  const now = new Date("2026-11-03T00:00:00Z");
  const range = rules.reminderCandidateRange(now);
  assert.equal(range.from.toISOString(), "2026-11-03T00:15:00.000Z");
  assert.equal(range.to.toISOString(), "2026-11-04T00:00:00.000Z");
});

// ---------------------------------------------------------------- expiry

test("pending expiry: 48 h after booking when the start is far away", () => {
  const created = new Date("2026-11-03T10:00:00Z");
  const start = new Date("2026-11-10T10:00:00Z");
  assert.equal(rules.pendingExpiresAt(created, start).toISOString(), "2026-11-05T10:00:00.000Z");
});

test("pending expiry: 2 h before the start when that comes first", () => {
  const created = new Date("2026-11-03T10:00:00Z");
  const start = new Date("2026-11-04T16:00:00Z"); // 30 h later
  assert.equal(rules.pendingExpiresAt(created, start).toISOString(), "2026-11-04T14:00:00.000Z");
});

test("short-notice booking: the owner still gets at least 1 hour (or until the start)", () => {
  const created = new Date("2026-11-03T10:00:00Z");
  assert.equal(
    rules.pendingExpiresAt(created, new Date("2026-11-03T11:30:00Z")).toISOString(),
    "2026-11-03T11:00:00.000Z",
    "booked 90 min ahead -> 1 h to confirm",
  );
  assert.equal(
    rules.pendingExpiresAt(created, new Date("2026-11-03T10:30:00Z")).toISOString(),
    "2026-11-03T10:30:00.000Z",
    "booked 30 min ahead -> until the start",
  );
});

test("isPendingExpired is inclusive of the expiry instant", () => {
  const created = new Date("2026-11-03T10:00:00Z");
  const start = new Date("2026-11-10T10:00:00Z");
  assert.equal(rules.isPendingExpired(created, start, new Date("2026-11-05T09:59:59Z")), false);
  assert.equal(rules.isPendingExpired(created, start, new Date("2026-11-05T10:00:00Z")), true);
});

test("the SQL expiry function uses the same constants and formula", () => {
  const sql = read("supabase/migrations/20261118000000_appointment_lifecycle.sql");
  assert.equal(rules.PENDING_EXPIRY.expireAfterSeconds, 172800);
  assert.equal(rules.PENDING_EXPIRY.beforeStartSeconds, 7200);
  assert.equal(rules.PENDING_EXPIRY.minOwnerWindowSeconds, 3600);
  assert.match(sql, /p_expire_after_seconds integer default 172800/);
  assert.match(sql, /p_before_start_seconds integer default 7200/);
  assert.match(sql, /p_min_owner_window_seconds integer default 3600/);
  assert.match(sql, /greatest\(\s*least\(created_at \+ make_interval\(secs => p_expire_after_seconds\), starts_at - make_interval\(secs => p_before_start_seconds\)\),\s*least\(created_at \+ make_interval\(secs => p_min_owner_window_seconds\), starts_at\)\s*\)/);
  assert.match(sql, /for update skip locked/);
});

// ------------------------------------------------------------ structural

test("every notice claims its ledger row before sending, and skips if it didn't get it", () => {
  const source = read("lib/appointment-lifecycle.ts");
  assert.match(source, /onConflict: "appointment_id,kind,starts_at", ignoreDuplicates: true/);
  for (const marker of ['claimNotice(supabase, appointment, "expired")', "claimNotice(supabase, appointment, kind)"]) {
    const at = source.indexOf(marker);
    assert.ok(at > 0, marker);
    const after = source.slice(at, at + 400);
    assert.match(after, /if \(!noticeId\) \{\s*result\.duplicatesSkipped\+\+;\s*continue;\s*\}/, `${marker} skips duplicates`);
    const firstSend = source.indexOf("sendAppointmentLifecycleEmail(", at);
    assert.ok(firstSend > at, `${marker}: the claim comes before any send`);
  }
});

test("slot labels use the business's own time zone", () => {
  const source = read("lib/appointment-lifecycle.ts");
  assert.equal((source.match(/formatSlotLabel\(new Date\(appointment\.starts_at\), business\.timezone\)/g) ?? []).length, 2);
});

test("expiry tells the prospect (email + channel template) and the owner, fires the workflow, supersedes the Copilot task", () => {
  const source = read("lib/appointment-lifecycle.ts");
  const expiry = source.slice(source.indexOf("async function expirePendingAppointments("), source.indexOf("async function sendDueReminders("));
  assert.match(expiry, /sendAppointmentLifecycleEmail\(appointment\.business_id, appointment\.contact_email, "expired", label\)/);
  assert.match(expiry, /templateKind: "appointment_expired"/);
  assert.match(expiry, /dispatchNotification\(\{/);
  assert.match(expiry, /"appointment_status_changed"[\s\S]*?\{ status: "expired" \}/);
  assert.match(expiry, /\.eq\("action_type", "confirm_appointment"\)/);
  const reminders = source.slice(source.indexOf("async function sendDueReminders("));
  assert.match(reminders, /\.eq\("status", "confirmed"\)/, "reminders only for confirmed appointments");
  assert.match(reminders, /templateKind: "appointment_reminder"/);
});

test("the appointment job is scheduled every 5 minutes", () => {
  assert.match(read("lib/scheduler/jobs.ts"), /name: "appointment_lifecycle", schedule: \{ kind: "every", seconds: 5 \* MINUTE \}/);
});

test("migration: 'expired' status, ledger table with RLS forced + deny policy, no client grants", () => {
  const sql = read("supabase/migrations/20261118000000_appointment_lifecycle.sql");
  assert.match(sql, /status in \('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show', 'expired'\)/);
  assert.match(sql, /constraint appointment_notifications_once unique \(appointment_id, kind, starts_at\)/);
  assert.match(sql, /alter table public\.appointment_notifications enable row level security;/);
  assert.match(sql, /alter table public\.appointment_notifications force row level security;/);
  assert.match(sql, /revoke all on public\.appointment_notifications from anon, authenticated;/);
  assert.match(sql, /create policy appointment_notifications_no_client_access[\s\S]*?as restrictive[\s\S]*?using \(false\)/);
  assert.match(sql, /revoke execute on function public\.expire_stale_pending_appointments\(integer, integer, integer, integer\) from public, anon, authenticated;/);
});

test("the UI knows the new status everywhere statuses are listed", () => {
  assert.match(read("lib/supabase/types.ts"), /export type AppointmentStatus = [^;]*"expired"/);
  assert.match(read("app/(dashboard)/dashboard/appointments/page.tsx"), /\{ value: "expired", label: "Expired" \}/);
  assert.match(read("app/(dashboard)/dashboard/workflows/workflow-form.tsx"), /"no_show", "expired"\] as const/);
});
