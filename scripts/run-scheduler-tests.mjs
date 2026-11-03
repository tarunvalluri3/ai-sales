// Scheduler tests (production readiness item 3; LAUNCH_AUDIT.md §2, blocker B3).
//
//   1. BEHAVIOURAL, with an in-memory lease store (no database):
//      - when each kind of job is due (every N s with jitter; daily at-most-once
//        vs retry-until-success; catch-up after a missed day);
//      - overlapping triggers never run the same job twice at once;
//      - retries, timeouts (not retried in-run), isolation between jobs, the
//        repeated-failure alert, a lost lease, a failed state read;
//      - the trigger's bearer auth (fails closed) and ?jobs= filter.
//   2. STRUCTURAL: the job registry, vercel.json still daily-only (Vercel Hobby
//      rejects sub-daily crons at deploy time), the SLA once-per-period gate,
//      and the migration's RLS posture.
//
// Run: npm run test:scheduler
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const schedule = await import(new URL("../lib/scheduler/schedule.ts", import.meta.url).href);
const runner = await import(new URL("../lib/scheduler/runner.ts", import.meta.url).href);
const auth = await import(new URL("../lib/scheduler/auth.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)

const at = (iso) => new Date(iso);

/** Lease semantics of try_acquire_scheduled_job / release_scheduled_job, in memory. */
function memoryStore({ failRead = false, loseLease = false } = {}) {
  const rows = new Map();
  let clock = () => Date.now();
  return {
    rows,
    setClock(fn) {
      clock = fn;
    },
    async readStates(names) {
      if (failRead) throw new Error("db down");
      const out = new Map();
      for (const name of names) {
        const row = rows.get(name);
        if (row) out.set(name, { lastStartedAt: row.lastStartedAt, lastSucceededAt: row.lastSucceededAt, consecutiveFailures: row.failures });
      }
      return out;
    },
    async acquire(name, owner, ttlSeconds) {
      const row = rows.get(name) ?? { failures: 0, lastStartedAt: null, lastSucceededAt: null, lockedUntil: null, lockedBy: null };
      if (row.lockedUntil && row.lockedUntil > clock()) return false;
      row.lockedUntil = clock() + ttlSeconds * 1000;
      row.lockedBy = owner;
      row.lastStartedAt = new Date(clock());
      rows.set(name, row);
      return true;
    },
    async release(name, owner, outcome) {
      const row = rows.get(name);
      if (!row || row.lockedBy !== owner || loseLease) return -1;
      row.lockedUntil = null;
      row.lockedBy = null;
      if (outcome.succeeded) {
        row.lastSucceededAt = new Date(clock());
        row.failures = 0;
      } else {
        row.failures += 1;
        row.lastError = outcome.error;
      }
      return row.failures;
    },
  };
}

const noSleep = async () => {};
const every = (seconds) => ({ kind: "every", seconds });

function job(name, run, extra = {}) {
  return { name, schedule: every(60), timeoutMs: 1_000, run, ...extra };
}

// ------------------------------------------------------------- schedule

test("every-N jobs: first run is due, then not until N seconds (with jitter) have passed", () => {
  const s = every(300);
  assert.equal(schedule.isJobDue(s, { lastStartedAt: null, lastSucceededAt: null }, at("2026-11-03T10:00:00Z")), true);
  const started = { lastStartedAt: at("2026-11-03T10:00:00Z"), lastSucceededAt: null };
  assert.equal(schedule.isJobDue(s, started, at("2026-11-03T10:02:00Z")), false);
  assert.equal(schedule.isJobDue(s, started, at("2026-11-03T10:04:50Z")), true, "within the jitter allowance");
  assert.equal(schedule.isJobDue(s, started, at("2026-11-03T10:05:00Z")), true);
});

test("daily slot boundaries", () => {
  assert.equal(schedule.latestDailySlot(at("2026-11-03T03:59:59Z"), 4).toISOString(), "2026-11-02T04:00:00.000Z");
  assert.equal(schedule.latestDailySlot(at("2026-11-03T04:00:00Z"), 4).toISOString(), "2026-11-03T04:00:00.000Z");
  assert.equal(schedule.latestDailySlot(at("2026-01-01T01:00:00Z"), 4).toISOString(), "2025-12-31T04:00:00.000Z");
});

test("daily (default): at most once per day -- a started run counts even if it failed", () => {
  const s = { kind: "daily", utcHour: 4 };
  const now = at("2026-11-03T06:00:00Z");
  assert.equal(schedule.isJobDue(s, { lastStartedAt: null, lastSucceededAt: null }, now), true);
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-11-02T04:00:10Z"), lastSucceededAt: null }, now), true, "yesterday's run doesn't count");
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-11-03T04:00:10Z"), lastSucceededAt: null }, now), false, "a failed run today still counts");
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-11-02T04:00:10Z"), lastSucceededAt: null }, at("2026-11-03T03:00:00Z")), false, "before today's slot");
});

test("daily (retryFailedSameDay): retried until a run succeeds; a missed day is caught up once", () => {
  const s = { kind: "daily", utcHour: 4, retryFailedSameDay: true };
  const now = at("2026-11-03T06:00:00Z");
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-11-03T04:00:10Z"), lastSucceededAt: at("2026-11-02T04:01:00Z") }, now), true);
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-11-03T04:00:10Z"), lastSucceededAt: at("2026-11-03T04:01:00Z") }, now), false);
  assert.equal(schedule.isJobDue(s, { lastStartedAt: at("2026-10-30T04:00:10Z"), lastSucceededAt: at("2026-10-30T04:01:00Z") }, now), true, "catch-up");
});

test("repeated-failure alert threshold", () => {
  assert.equal(schedule.shouldAlertRepeatedFailure(2), false);
  assert.equal(schedule.shouldAlertRepeatedFailure(3), true);
  assert.equal(schedule.shouldAlertRepeatedFailure(-1), false);
});

// ---------------------------------------------------------------- runner

test("runs due jobs, records success, skips jobs that are not due", async () => {
  const store = memoryStore();
  let runs = 0;
  const jobs = [job("a", async () => ++runs)];
  const first = await runner.runScheduledJobs({ jobs, store, ownerId: "o1", sleep: noSleep });
  assert.equal(first[0].status, "succeeded");
  const second = await runner.runScheduledJobs({ jobs, store, ownerId: "o2", sleep: noSleep });
  assert.equal(second[0].status, "not_due");
  assert.equal(runs, 1);
});

test("overlapping triggers: the second run sees the lease and skips the job", async () => {
  const store = memoryStore();
  let release;
  let runs = 0;
  const slow = job("slow", () => {
    runs++;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const first = runner.runScheduledJobs({ jobs: [slow], store, ownerId: "o1", sleep: noSleep });
  await new Promise((resolve) => setTimeout(resolve, 10));
  // Force "due" for the second trigger: it must still be refused by the lease.
  const overlapping = await runner.runScheduledJobs({
    jobs: [{ ...slow, schedule: every(0) }],
    store,
    ownerId: "o2",
    sleep: noSleep,
  });
  assert.equal(overlapping[0].status, "locked");
  release("done");
  assert.equal((await first)[0].status, "succeeded");
  assert.equal(runs, 1, "never ran twice at once");
});

test("a failed attempt is retried once within the run", async () => {
  const store = memoryStore();
  let calls = 0;
  const flaky = job("flaky", async () => {
    calls++;
    if (calls === 1) throw new Error("transient");
    return { ok: true };
  });
  const [report] = await runner.runScheduledJobs({ jobs: [flaky], store, ownerId: "o", sleep: noSleep });
  assert.equal(report.status, "succeeded");
  assert.equal(report.attempts, 2);
  assert.equal(store.rows.get("flaky").failures, 0);
});

test("retries: 0 means a single attempt", async () => {
  const store = memoryStore();
  let calls = 0;
  const once = job("once", async () => {
    calls++;
    throw new Error("nope");
  }, { retries: 0 });
  const [report] = await runner.runScheduledJobs({ jobs: [once], store, ownerId: "o", sleep: noSleep });
  assert.equal(report.status, "failed");
  assert.equal(calls, 1);
});

test("a timeout is not retried in-run, frees the lease, and is reported", async () => {
  const store = memoryStore();
  let calls = 0;
  const hang = job("hang", () => {
    calls++;
    return new Promise(() => {});
  }, { timeoutMs: 30 });
  const events = [];
  const [report] = await runner.runScheduledJobs({ jobs: [hang], store, ownerId: "o", sleep: noSleep, onEvent: (e) => events.push(e) });
  assert.equal(report.status, "timed_out");
  assert.equal(calls, 1);
  assert.equal(store.rows.get("hang").lockedBy, null, "lease released");
  assert.ok(events.some((e) => e.event === "scheduler_job_failed" && e.level === "error" && e.metadata.timedOut === true));
});

test("one failing job never stops the others", async () => {
  const store = memoryStore();
  const reports = await runner.runScheduledJobs({
    jobs: [job("bad", async () => Promise.reject(new Error("x"))), job("good", async () => "ok")],
    store,
    ownerId: "o",
    sleep: noSleep,
  });
  assert.deepEqual(
    reports.map((r) => [r.job, r.status]),
    [
      ["bad", "failed"],
      ["good", "succeeded"],
    ],
  );
});

test("three consecutive failures raise the scheduler_job_failing alert", async () => {
  const store = memoryStore();
  const events = [];
  const failing = job("failing", async () => Promise.reject(new Error("still down")), { retries: 0, schedule: every(0) });
  for (let i = 0; i < 3; i++) {
    await runner.runScheduledJobs({ jobs: [failing], store, ownerId: `o${i}`, sleep: noSleep, onEvent: (e) => events.push(e) });
  }
  const alerts = events.filter((e) => e.event === "scheduler_job_failing");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].metadata.consecutiveFailures, 3);
  assert.equal(alerts[0].level, "error");
});

test("a lost lease is reported, not silently ignored", async () => {
  const store = memoryStore({ loseLease: true });
  const events = [];
  await runner.runScheduledJobs({ jobs: [job("x", async () => 1)], store, ownerId: "o", sleep: noSleep, onEvent: (e) => events.push(e) });
  assert.ok(events.some((e) => e.event === "scheduler_job_lock_lost"));
});

test("a failed state read: frequent jobs still run, daily jobs wait (never a second digest)", async () => {
  const store = memoryStore({ failRead: true });
  const events = [];
  const reports = await runner.runScheduledJobs({
    jobs: [job("queue", async () => 1), job("digest", async () => 1, { schedule: { kind: "daily", utcHour: 0 } })],
    store,
    ownerId: "o",
    sleep: noSleep,
    onEvent: (e) => events.push(e),
  });
  assert.deepEqual(reports.map((r) => r.status), ["succeeded", "not_due"]);
  assert.ok(events.some((e) => e.event === "scheduler_state_read_failed"));
});

test("a fresh database (no rows yet) runs daily jobs normally", async () => {
  const store = memoryStore();
  const [report] = await runner.runScheduledJobs({
    jobs: [job("digest", async () => 1, { schedule: { kind: "daily", utcHour: 0 } })],
    store,
    ownerId: "o",
    sleep: noSleep,
  });
  assert.equal(report.status, "succeeded");
});

test("the runner never throws, even when acquiring the lease throws", async () => {
  const store = memoryStore();
  store.acquire = async () => {
    throw new Error("rpc down");
  };
  const [report] = await runner.runScheduledJobs({ jobs: [job("x", async () => 1)], store, ownerId: "o", sleep: noSleep });
  assert.equal(report.status, "failed");
});

test("`only` restricts a run to the named jobs", async () => {
  const store = memoryStore();
  const reports = await runner.runScheduledJobs({
    jobs: [job("a", async () => 1), job("b", async () => 1)],
    store,
    ownerId: "o",
    only: ["b"],
    sleep: noSleep,
  });
  assert.deepEqual(reports.map((r) => [r.job, r.status]), [
    ["a", "skipped"],
    ["b", "succeeded"],
  ]);
});

test("lease covers every attempt plus a margin", () => {
  assert.equal(runner.leaseSeconds({ timeoutMs: 40_000, retries: 1 }), 140);
  assert.equal(runner.leaseSeconds({ timeoutMs: 40_000, retries: 0 }), 100);
});

// ------------------------------------------------------------------ auth

test("trigger auth: fails closed and is exact", () => {
  const secret = "s".repeat(32);
  assert.equal(auth.isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
  assert.equal(auth.isAuthorizedCronRequest(`Bearer ${secret}x`, secret), false);
  assert.equal(auth.isAuthorizedCronRequest(secret, secret), false, "Bearer prefix required");
  assert.equal(auth.isAuthorizedCronRequest(null, secret), false);
  assert.equal(auth.isAuthorizedCronRequest(`Bearer ${secret}`, undefined), false, "no secret = closed");
  assert.equal(auth.isAuthorizedCronRequest("Bearer short", "short"), false, "a short secret is refused");
});

test("?jobs= filter keeps known names and reports unknown ones", () => {
  assert.deepEqual(auth.parseJobFilter(null, ["a", "b"]), { only: [], unknown: [] });
  assert.deepEqual(auth.parseJobFilter("b, a,b,zzz", ["a", "b"]), { only: ["b", "a"], unknown: ["zzz"] });
});

// ------------------------------------------------------------ structural

test("job registry: unique valid names, timeouts under the 60 s route limit, the digest never retried", () => {
  const source = read("lib/scheduler/jobs.ts");
  const names = [...source.matchAll(/name: "([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 15);
  assert.equal(new Set(names).size, names.length, "unique");
  for (const name of names) assert.match(name, /^[a-z][a-z0-9_]{1,62}$/, "matches the table's check constraint");
  for (const ms of [...source.matchAll(/timeoutMs: ([\d_]+)/g)].map((m) => Number(m[1].replaceAll("_", "")))) {
    assert.ok(ms < 60_000, `timeout ${ms} must stay under maxDuration`);
  }
  assert.match(source, /name: "daily_digest", schedule: DAILY_0400_UTC, timeoutMs: [\d_]+, retries: 0/);
  for (const sweep of ["recoverStuckInboundReplies", "runSlaEscalationSweep", "processWhatsappOutboundMessages", "releaseStaleQueueClaims"]) {
    assert.match(source, new RegExp(`run: ${sweep}`));
  }
});

test("vercel.json has no sub-daily schedule (Vercel Hobby rejects them at deploy time)", () => {
  const { crons = [] } = JSON.parse(read("vercel.json"));
  for (const cron of crons) {
    const [minute, hour] = cron.schedule.split(/\s+/);
    assert.match(minute, /^\d+$/, `${cron.path}: fixed minute`);
    assert.match(hour, /^\d+$/, `${cron.path}: fixed hour (once a day)`);
  }
});

test("both cron routes go through the shared authenticated trigger", () => {
  for (const file of ["app/api/cron/run/route.ts", "app/api/cron/process-ingestion-queue/route.ts"]) {
    assert.match(read(file), /return handleSchedulerTrigger\(request\);/);
  }
  assert.match(read("lib/scheduler/trigger.ts"), /isAuthorizedCronRequest\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/);
});

test("SLA sweep escalates a conversation at most once per SLA period", async () => {
  const source = read("lib/sla-routing.ts");
  assert.match(source, /\.or\(slaReescalationFilter\(overdueBefore\)\)/);
  assert.match(source, /sla_escalated_at: new Date\(\)\.toISOString\(\)/);
  // \s+ (not \n) so the check works on CRLF checkouts too.
  assert.match(source, /export function slaReescalationFilter\(overdueBeforeIso: string\): string \{\s+return `sla_escalated_at\.is\.null,sla_escalated_at\.lt\.\$\{overdueBeforeIso\}`;/);
});

test("migration: new table has RLS enabled, forced, a deny policy and no client grants", () => {
  const sql = read("supabase/migrations/20261116000000_scheduler_job_runs.sql");
  assert.match(sql, /alter table public\.scheduled_job_runs enable row level security;/);
  assert.match(sql, /alter table public\.scheduled_job_runs force row level security;/);
  assert.match(sql, /revoke all on public\.scheduled_job_runs from anon, authenticated;/);
  assert.match(sql, /create policy scheduled_job_runs_no_client_access[\s\S]*?as restrictive[\s\S]*?using \(false\)/);
  for (const fn of ["try_acquire_scheduled_job\\(text, text, integer\\)", "release_scheduled_job\\(text, text, boolean, text, integer, jsonb\\)", "release_stale_queue_claims\\(integer\\)"]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn} from public, anon, authenticated;`));
  }
});
