// Suspension / soft-delete gate tests (2026-11-01). Before this, a platform
// admin's suspend or soft-delete stopped the website widget but not WhatsApp
// or Instagram: lib/business-ai-context.ts checked only live_version_id.
//
// Two kinds of proof, same approach as scripts/run-tool-scope-tests.mjs
// (the webhook routes and loaders need Next/Supabase and cannot be imported
// under plain Node):
//   1. BEHAVIOURAL -- the pure decisions every channel uses
//      (lib/business-lifecycle.ts, lib/widget-access.ts,
//      lib/agent-published.ts) refuse a suspended or deleted business.
//   2. STRUCTURAL -- every AI entry point goes through those decisions, the
//      webhooks refuse BEFORE any reply (AI or canned), and any file that
//      calls askSalesEmployee()/streamSalesEmployee() gets its context from
//      a gated loader -- so a new channel cannot skip the check.
//
// Pure modules + source reads only: no database, no Gemini, no network.
// Run: npm run test:business-lifecycle
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { businessLifecycleBlock, evaluateChannelAccess } = await import(
  new URL("../lib/business-lifecycle.ts", import.meta.url).href
);
const { evaluateWidgetAccess, widgetRejectionStatus } = await import(
  new URL("../lib/widget-access.ts", import.meta.url).href
);
const { needsPublishedRestamp } = await import(new URL("../lib/agent-published.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)

const LIVE = "11111111-1111-1111-1111-111111111111";
const active = { status: "active", deleted_at: null, live_version_id: LIVE };
const suspended = { ...active, status: "suspended" };
const deleted = { ...active, deleted_at: "2026-11-01T00:00:00Z" };
const ORIGIN = "https://client.example";
const key = { status: "active", allowed_origins: [ORIGIN] };

// ---------------------------------------------------------------- behavioural

test("businessLifecycleBlock: suspended and deleted are blocked, active is not", () => {
  assert.equal(businessLifecycleBlock(active), null);
  assert.equal(businessLifecycleBlock(suspended), "business_suspended");
  assert.equal(businessLifecycleBlock(deleted), "business_deleted");
  assert.equal(businessLifecycleBlock({ ...suspended, deleted_at: "2026-11-01T00:00:00Z" }), "business_deleted");
});

test("widget: a suspended or deleted business gets no AI reply (403)", () => {
  assert.equal(evaluateWidgetAccess(key, active, ORIGIN), null);
  for (const [business, reason] of [[suspended, "business_suspended"], [deleted, "business_deleted"]]) {
    const got = evaluateWidgetAccess(key, business, ORIGIN);
    assert.equal(got, reason);
    assert.equal(widgetRejectionStatus(got), 403);
  }
});

test("WhatsApp/Instagram channel gate: suspended, deleted, unpublished and missing are refused", () => {
  assert.equal(evaluateChannelAccess(active), null);
  assert.equal(evaluateChannelAccess(suspended), "business_suspended");
  assert.equal(evaluateChannelAccess(deleted), "business_deleted");
  assert.equal(evaluateChannelAccess({ ...active, live_version_id: null }), "agent_not_published");
  assert.equal(evaluateChannelAccess(null), "business_not_found");
  // Suspension wins over "unpublished": the reason logged is the real one.
  assert.equal(evaluateChannelAccess({ ...suspended, live_version_id: null }), "business_suspended");
});

test("reinstate repair applies only to an active, live row with no published_at", () => {
  const bugRow = { ...active, published_at: null };
  assert.equal(needsPublishedRestamp(bugRow), true);
  assert.equal(needsPublishedRestamp({ ...bugRow, published_at: "2026-11-01T00:00:00Z" }), false);
  assert.equal(needsPublishedRestamp({ ...bugRow, live_version_id: null }), false);
  assert.equal(needsPublishedRestamp({ ...bugRow, status: "suspended" }), false);
  assert.equal(needsPublishedRestamp({ ...bugRow, deleted_at: "2026-11-01T00:00:00Z" }), false);
});

// ----------------------------------------------------------------- structural

for (const channel of ["whatsapp", "instagram"]) {
  test(`${channel}: the channel gate runs before ANY reply and returns when it refuses`, () => {
    const source = read(channel === "instagram" ? "app/api/meta/instagram/webhook/route.ts" : `app/api/webhooks/${channel}/route.ts`);
    // Instagram starts the read early (2026-11-02 latency pass) and gates on its result later,
    // so the gate is the `if (!contextResult.ok)` check, not the call site.
    assert.ok(source.includes("loadBusinessAiContext(businessId)"), "webhook loads its context through loadBusinessAiContext");
    const gate = channel === "instagram" ? source.indexOf("if (!contextResult.ok)") : source.indexOf("await loadBusinessAiContext(businessId)");
    assert.ok(gate > 0, "the webhook gates on the context result");
    const firstReply = source.indexOf("await sendCannedReply(");
    const aiCall = source.indexOf("await askSalesEmployee(");
    assert.ok(firstReply > gate, "no canned reply is sent before the gate");
    assert.ok(aiCall > gate, "no AI call happens before the gate");
    // `return;`, `return { ... };` or (WhatsApp, production readiness item 2) `return "skipped";`.
    assert.match(source.slice(gate, firstReply), /if \(!contextResult\.ok\) \{[\s\S]*?return(?: \{[^}]*\}| "\w+")?;\s*\}/);
  });
}

test("loadBusinessAiContext reads status/deleted_at and decides with the shared helper", () => {
  const source = read("lib/business-ai-context.ts");
  assert.match(source, /\.select\("id, clerk_org_id, live_version_id, status, deleted_at"\)/);
  assert.match(source, /evaluateChannelAccess\(data\)/);
});

test("widget, dashboard and answer-bank generation use the shared lifecycle helper", () => {
  assert.match(read("lib/widget-access.ts"), /businessLifecycleBlock\(business\)/);
  assert.match(read("lib/business-context.ts"), /businessLifecycleBlock\(business\)/);
  assert.match(read("lib/answer-bank/generate.ts"), /businessLifecycleBlock\(business\)/);
  for (const file of ["lib/widget-access.ts", "lib/business-context.ts"]) {
    assert.doesNotMatch(read(file), /status === "suspended"/, `${file} must not hand-roll the check`);
  }
});

/** Every .ts/.tsx file under app/ and lib/. */
function sourceFiles(dir) {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const relative = path.join(dir, name);
    if (statSync(path.join(ROOT, relative)).isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/.test(name) ? [relative] : [];
  });
}

test("every caller of askSalesEmployee/streamSalesEmployee gets its context from a gated loader", () => {
  const GATES = /resolveBusinessFromWidgetKey|loadBusinessAiContext|requireBusinessContext/;
  const callers = [...sourceFiles("app"), ...sourceFiles("lib")].filter((file) => {
    if (file.replaceAll("\\", "/") === "lib/rag.ts") return false;
    // A real call has arguments; `askSalesEmployee()` in a comment does not.
    return /\b(askSalesEmployee|streamSalesEmployee)\(\s*[^)\s]/.test(read(file));
  });
  assert.ok(callers.length >= 4, `found the known callers (got ${callers.join(", ")})`);
  for (const file of callers) {
    assert.ok(GATES.test(read(file)), `${file} calls the AI without a gated context loader`);
  }
});

test("/apache reinstatement runs the published repair; the repair writes what a publish writes", () => {
  assert.match(read("lib/admin-tenant-actions.ts"), /await restampPublishedIfMissing\(supabase, businessId\)/);
  const repair = read("lib/agent-published-repair.ts");
  assert.match(repair, /needsPublishedRestamp\(row\)/);
  assert.match(repair, /published_at: now, onboarding_step: "live", onboarding_completed_at:/);
  assert.match(repair, /\.is\("published_at", null\)/);
  assert.match(repair, /live_answer_bank_version: stamped\.answer_bank_version/);
});
