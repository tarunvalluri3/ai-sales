// Observability tests (production readiness item 9; LAUNCH_AUDIT.md §1, §5).
//
//   1. BEHAVIOURAL (pure): the deep health verdict -- database down or a
//      stopped scheduler is 503; an unknown scheduler, dead letters or open
//      billing cancellations only degrade; the max-age setting.
//   2. STRUCTURAL: /api/health stays liveness-only by default, the deep
//      details need the cron secret, and the /apache scheduler/billing panels
//      sit behind requirePlatformAdmin.
//
// Run: npm run test:observability
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const health = await import(new URL("../lib/health-rules.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const NOW = new Date("2026-11-03T12:00:00Z");
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000);
const base = { databaseOk: true, lastSchedulerStartAt: minutesAgo(2), now: NOW, schedulerMaxAgeMinutes: 15, deadLetters24h: 0, openBillingCancellations: 0 };

test("all good -> ok / 200", () => {
  const report = health.evaluateHealth(base);
  assert.equal(report.status, "ok");
  assert.equal(report.httpStatus, 200);
  assert.deepEqual(report.checks, { database: "ok", scheduler: "ok" });
  assert.equal(report.details.schedulerLastStartMinutesAgo, 2);
});

test("database down -> down / 503 (scheduler unknown, not 'stale')", () => {
  const report = health.evaluateHealth({ ...base, databaseOk: false, lastSchedulerStartAt: null });
  assert.equal(report.httpStatus, 503);
  assert.deepEqual(report.checks, { database: "down", scheduler: "unknown" });
});

test("scheduler silent longer than the max age -> down / 503", () => {
  const report = health.evaluateHealth({ ...base, lastSchedulerStartAt: minutesAgo(16) });
  assert.equal(report.status, "down");
  assert.equal(report.httpStatus, 503);
  assert.equal(report.checks.scheduler, "stale");
  assert.equal(health.evaluateHealth({ ...base, lastSchedulerStartAt: minutesAgo(15) }).checks.scheduler, "ok", "boundary");
});

test("no scheduler run recorded yet, dead letters, open cancellations -> degraded but 200", () => {
  assert.deepEqual(
    [health.evaluateHealth({ ...base, lastSchedulerStartAt: null })].map((r) => [r.status, r.httpStatus, r.checks.scheduler]),
    [["degraded", 200, "unknown"]],
  );
  assert.equal(health.evaluateHealth({ ...base, deadLetters24h: 3 }).status, "degraded");
  assert.equal(health.evaluateHealth({ ...base, openBillingCancellations: 1 }).status, "degraded");
  assert.equal(health.evaluateHealth({ ...base, deadLetters24h: null }).status, "ok", "an unreadable count doesn't flap the check");
});

test("scheduler max age setting", () => {
  assert.equal(health.schedulerMaxAgeMinutes(undefined), 15);
  assert.equal(health.schedulerMaxAgeMinutes("1500"), 1500);
  assert.equal(health.schedulerMaxAgeMinutes("0"), 15);
  assert.equal(health.schedulerMaxAgeMinutes("soon"), 15);
});

test("/api/health: liveness by default; deep details only with the cron secret", () => {
  const route = read("app/api/health/route.ts");
  assert.match(route, /if \(parsed\.data\.deep\) \{/);
  assert.match(route, /const authorized = isAuthorizedCronRequest\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\);/);
  assert.match(route, /\.\.\.\(authorized \? \{ details: report\.details \} : \{\}\)/);
  assert.match(route, /status: report\.httpStatus/);
  assert.match(route, /status: "ok",\s*timestamp: new Date\(\)\.toISOString\(\),\s*\.\.\.\(parsed\.data\.verbose === "true"/, "the plain liveness body is unchanged");
});

test("the scheduler and billing panels are behind the platform-admin gate", () => {
  const page = read("app/(dashboard)/apache/jobs/page.tsx");
  const gate = page.indexOf('await requirePlatformAdmin("viewer");');
  assert.ok(gate > 0 && gate < page.indexOf("listSchedulerJobStatus()"));
  // lib/health.ts reads with the service role: the public route may import only the
  // deep check (counts, gated by the cron secret), never the admin list functions.
  assert.match(read("app/api/health/route.ts"), /import \{ runDeepHealthCheck \} from "@\/lib\/health";/);
  assert.match(page, /import \{ listOpenBillingCancellations, listSchedulerJobStatus \} from "@\/lib\/health";/);
});

const sentry = await import(new URL("../lib/sentry-config.ts", import.meta.url).href);

test("Sentry tracing stays off by default and is bounded 0..1 when set", () => {
  assert.equal(sentry.sentryTracesSampleRate(undefined), 0);
  assert.equal(sentry.sentryTracesSampleRate(""), 0);
  assert.equal(sentry.sentryTracesSampleRate("0.05"), 0.05);
  assert.equal(sentry.sentryTracesSampleRate("5"), 1);
  assert.equal(sentry.sentryTracesSampleRate("-1"), 0);
  assert.equal(sentry.sentryTracesSampleRate("lots"), 0);
});

test("Sentry events carry the resolved environment", () => {
  assert.equal(sentry.sentryEnvironment({ APP_ENV: "staging" }), "staging");
  assert.equal(sentry.sentryEnvironment({ VERCEL_ENV: "production" }), "production");
  assert.equal(sentry.sentryEnvironment({ APP_ENV: "bogus" }), "development");
  for (const file of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
    const source = read(file);
    assert.match(source, /tracesSampleRate: sentryTracesSampleRate\(process\.env\.SENTRY_TRACES_SAMPLE_RATE\)/);
    assert.match(source, /environment: sentryEnvironment\(process\.env\)/);
  }
});

test("rate-limit rejections are logged, but never sent to Sentry (quota burn under abuse)", () => {
  for (const file of ["app/api/chat/route.ts", "app/api/webhooks/whatsapp/route.ts", "app/api/meta/instagram/webhook/route.ts"]) {
    const calls = [...read(file).matchAll(/logEvent\("rate_limit_exceeded"[^\n]*/g)].map((m) => m[0]);
    assert.ok(calls.length >= 2, file);
    for (const call of calls) assert.doesNotMatch(call, /"error"\)/, `${file}: ${call}`);
  }
});
