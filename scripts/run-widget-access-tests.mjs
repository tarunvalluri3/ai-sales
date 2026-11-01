// Widget access + publish-status tests (2026-11-01, the "GR Engineers" bug:
// publish showed "Live" in the header while /api/chat answered every visitor
// with 401 because publish_agent() never set published_at).
//
// Covers: a published agent's key is accepted from an allowed origin (also in
// the exact state the bug left rows in -- live_version_id set, published_at
// null); unpublished / disallowed origin / missing origin / bad key are
// rejected with the right internal reason and status (403 vs 401); the
// consent contract (consentGiven is optional, never a precondition); the
// widget loader treats 403 like 401; publish_agent() is no longer called with
// the backfill flag; and no live/published surface reads published_at.
//
// Pure modules + source reads only: no database, no Gemini, no network.
// Run: npm run test:widget-access
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { evaluateWidgetAccess, widgetRejectionStatus } = await import(
  new URL("../lib/widget-access.ts", import.meta.url).href
);
const { isAgentPublished } = await import(new URL("../lib/agent-published.ts", import.meta.url).href);
const { chatRequestBodySchema } = await import(
  new URL("../lib/schemas/widget-chat-request.ts", import.meta.url).href
);

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const ORIGIN = "https://client-rho-sage.vercel.app";
const activeKey = { status: "active", allowed_origins: [ORIGIN] };
const publishedBusiness = { live_version_id: "11111111-1111-1111-1111-111111111111", status: "active", deleted_at: null };
const unpublishedBusiness = { ...publishedBusiness, live_version_id: null };

function decide(key, business, origin) {
  const reason = evaluateWidgetAccess(key, business, origin);
  return { reason, status: reason ? widgetRejectionStatus(reason) : 200 };
}

test("published agent + active key + allowed origin is accepted", () => {
  assert.deepEqual(decide(activeKey, publishedBusiness, ORIGIN), { reason: null, status: 200 });
});

test("the bug's row state (live_version_id set, published_at null) is accepted -- published_at is not the signal", () => {
  assert.deepEqual(decide(activeKey, { ...publishedBusiness, published_at: null }, ORIGIN), { reason: null, status: 200 });
  assert.equal(isAgentPublished({ live_version_id: "v", published_at: null }), true);
  assert.equal(isAgentPublished({ live_version_id: null, published_at: "2026-11-01T00:00:00Z" }), false);
});

test("unpublished agent is rejected with agent_not_published / 403", () => {
  assert.deepEqual(decide(activeKey, unpublishedBusiness, ORIGIN), { reason: "agent_not_published", status: 403 });
});

test("disallowed origin is rejected with origin_not_allowed / 403 (exact match only)", () => {
  for (const origin of [`${ORIGIN}/`, "https://www.client-rho-sage.vercel.app", "http://client-rho-sage.vercel.app", "https://evil.example"]) {
    assert.deepEqual(decide(activeKey, publishedBusiness, origin), { reason: "origin_not_allowed", status: 403 }, origin);
  }
});

test("missing origin is rejected with origin_missing / 403", () => {
  assert.deepEqual(decide(activeKey, publishedBusiness, null), { reason: "origin_missing", status: 403 });
});

test("unknown or revoked key is 401 -- the only 401s", () => {
  assert.deepEqual(decide(null, null, ORIGIN), { reason: "key_not_found", status: 401 });
  assert.deepEqual(decide(activeKey, null, ORIGIN), { reason: "key_not_found", status: 401 });
  assert.deepEqual(decide({ ...activeKey, status: "revoked" }, publishedBusiness, ORIGIN), { reason: "key_revoked", status: 401 });
});

test("suspended or deleted business is 403", () => {
  assert.deepEqual(decide(activeKey, { ...publishedBusiness, status: "suspended" }, ORIGIN), { reason: "business_suspended", status: 403 });
  assert.deepEqual(decide(activeKey, { ...publishedBusiness, deleted_at: "2026-11-01T00:00:00Z" }, ORIGIN), { reason: "business_deleted", status: 403 });
});

test("server-side failures are 503, not an auth status", () => {
  assert.equal(widgetRejectionStatus("lookup_failed"), 503);
  assert.equal(widgetRejectionStatus("live_version_unavailable"), 503);
});

test("consent: the exact failing request body parses with consentGiven false, true or absent", () => {
  const body = {
    widgetKey: "ae9ccc94-6463-437c-9407-74c80ee5e3d2",
    message: "Do you sell high quality screws?",
    visitorId: "cfbedd5f-0000-0000-0000-000000000000",
    pageUrl: `${ORIGIN}/`,
    consentGiven: false,
    stream: true,
    suggested: true,
    clientElapsedMs: 12264,
  };
  assert.equal(chatRequestBodySchema.safeParse(body).success, true);
  assert.equal(chatRequestBodySchema.safeParse({ ...body, consentGiven: true }).success, true);
  const { consentGiven: _omit, ...withoutConsent } = body;
  void _omit;
  assert.equal(chatRequestBodySchema.safeParse(withoutConsent).success, true);
});

test("consent: /api/chat never rejects on consent -- it is only recorded when given", () => {
  const route = read("app/api/chat/route.ts");
  const uses = route.split("\n").filter((line) => line.includes("consentGiven"));
  // destructure + the conditional consent write; nothing that returns an error.
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.doesNotMatch(line, /jsonError|return withCors/, line);
  }
  assert.match(route, /consentGiven\s*\n?\s*\?\s*timer\.time\("consent_write"/);
});

test("widget loader shows 'not available' for both 401 and 403", () => {
  assert.match(read("public/widget-loader.js"), /response\.status === 401 \|\| response\.status === 403\) kind = "unauthorized"/);
});

test("every widget route answers an auth failure with the error's own status and logs the reason", () => {
  for (const route of ["chat", "chat/warm", "chat/poll", "chat/recent", "chat/restore"]) {
    const source = read(`app/api/${route}/route.ts`);
    assert.match(source, /logWidgetRejection\(error, "/, route);
    assert.match(source, /jsonError\("Invalid request\.", error\.status\)/, route);
    assert.doesNotMatch(source, /WidgetAuthError\) \{\s*return withCors\(jsonError\("Invalid request\.", 401\)\)/, route);
  }
});

test("the latest publish_agent() definition does not pass the backfill flag", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const latest = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => readFileSync(new URL(name, dir), "utf8").includes("create or replace function public.publish_agent("))
    .at(-1);
  assert.ok(latest, "a migration defines publish_agent");
  const sql = readFileSync(new URL(latest, dir), "utf8");
  const body = sql.slice(sql.indexOf("create or replace function public.publish_agent("));
  assert.match(body, /agent_publish_internal\(p_business_id, coalesce\(v_actor, 'unknown'\), false\)/, latest);
});

test("the 20261110000000 repair skips suspended and soft-deleted businesses", () => {
  const sql = read("supabase/migrations/20261110000000_fix_publish_agent_backfill_flag.sql");
  const repair = sql.slice(sql.indexOf("do $$"));
  assert.match(repair, /and status = 'active'/);
  assert.match(repair, /and deleted_at is null/);
});

test("no live/published surface decides from published_at", () => {
  for (const file of [
    "lib/widget-auth.ts",
    "lib/business-context.ts",
    "lib/onboarding-steps.ts",
    "app/(dashboard)/onboarding/page.tsx",
    "app/(dashboard)/dashboard/widget-settings/page.tsx",
    "lib/answer-bank/generate.ts",
    "lib/answer-bank/dashboard.ts",
  ]) {
    assert.doesNotMatch(read(file), /published_at/, file);
    assert.match(read(file), /isAgentPublished|published\b/, file);
  }
});
