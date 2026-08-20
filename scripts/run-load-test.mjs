// Phase 23 concurrent-load test for /api/chat -- no new dependency,
// hand-rolled with the platform `fetch`, matching this project's existing
// scripts/run-evals.mjs / scripts/run-pgtap-tests.mjs convention.
//
// Fires CONCURRENCY simultaneous, independent conversations (distinct
// conversationIds, so this genuinely exercises concurrent DB writes and
// concurrent Gemini calls, not just concurrent HTTP connections) against
// a real widget key, and reports success/error counts and latency
// percentiles. Deliberately stays under the IP-scope rate limit (30
// requests / 5 minutes, app/api/chat/route.ts) by default -- this test's
// purpose is to prove the widget path holds up *within* the limits it's
// designed to run under, not to re-prove the rate limiter itself (already
// covered by Phase 18/21's live burst tests).
//
// Usage:
//   node --env-file=.env.local scripts/run-load-test.mjs \
//     --url=http://localhost:3000/api/chat \
//     --widget-key=<uuid> \
//     --origin=http://localhost:3000 \
//     --concurrency=10 \
//     --message="What are your business hours?"
//
// Every real request here makes a real Gemini call (real cost/latency) --
// choose --concurrency deliberately, do not default to a large number.

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[Math.max(0, index)];
}

async function sendOneConversation(url, widgetKey, origin, message) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ widgetKey, message }),
    });
    const latencyMs = Date.now() - startedAt;
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, latencyMs, body };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - startedAt, error: String(error) };
  }
}

async function main() {
  const args = parseArgs();
  const url = args.url ?? "http://localhost:3000/api/chat";
  const widgetKey = args["widget-key"];
  const origin = args.origin ?? "http://localhost:3000";
  const concurrency = Number.parseInt(args.concurrency ?? "10", 10);
  const message = args.message ?? "What are your business hours?";

  if (!widgetKey) {
    console.error("Missing required --widget-key=<uuid>. See this script's header comment for usage.");
    process.exitCode = 1;
    return;
  }

  console.log(`Firing ${concurrency} concurrent, independent conversations at ${url}...`);
  const startedAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => sendOneConversation(url, widgetKey, origin, message)),
  );
  const wallClockMs = Date.now() - startedAt;

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  console.log(`\nWall clock: ${wallClockMs}ms for ${concurrency} concurrent requests`);
  console.log(`Succeeded: ${succeeded.length}/${concurrency}`);
  console.log(`Failed: ${failed.length}/${concurrency}`);
  console.log(`Latency p50: ${percentile(latencies, 50)}ms  p95: ${percentile(latencies, 95)}ms  max: ${latencies[latencies.length - 1]}ms`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const r of failed) {
      console.log(`  status=${r.status} latencyMs=${r.latencyMs} body=${JSON.stringify(r.body ?? r.error)}`);
    }
    process.exitCode = 1;
  }
}

main();
