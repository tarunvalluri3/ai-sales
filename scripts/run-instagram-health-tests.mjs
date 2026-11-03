// Instagram connection health tests (production readiness item 7;
// LAUNCH_AUDIT.md §6).
//
//   1. BEHAVIOURAL (pure): reading Meta's subscribed_apps list; the verdict
//      for every probe outcome (healthy, Page subscription removed, revoked
//      token 190/102, transient 5xx/429/network, other errors) -- and that the
//      outside-window code 10 is never treated as a revoked token.
//   2. STRUCTURAL: the job is scheduled; Facebook Login connections are probed
//      with the Page token on /subscribed_apps and re-subscribed with the
//      connect flow's fields; the owner is alerted only on the transition to
//      disconnected; no token ever reaches a log line.
//
// Run: npm run test:instagram-health
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { isAppSubscribed, judgeHealthProbe } = await import(new URL("../lib/instagram-health-rules.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const APP_ID = "1876820120425285";
const facebook = { checkSubscription: true, appId: APP_ID };

test("subscribed_apps: our app id present / absent / malformed bodies", () => {
  assert.equal(isAppSubscribed({ data: [{ id: APP_ID, name: "Waves AI Pilot" }] }, APP_ID), true);
  assert.equal(isAppSubscribed({ data: [{ id: 1876820120425285 }] }, APP_ID), true, "numeric ids too");
  assert.equal(isAppSubscribed({ data: [{ id: "999" }] }, APP_ID), false);
  assert.equal(isAppSubscribed({ data: [] }, APP_ID), false);
  assert.equal(isAppSubscribed({}, APP_ID), false);
  assert.equal(isAppSubscribed(null, APP_ID), false);
  assert.equal(isAppSubscribed({ data: [{ id: APP_ID }] }, undefined), false, "no app id configured -> can't confirm");
});

test("verdicts", () => {
  assert.equal(judgeHealthProbe({ ok: true, data: { data: [{ id: APP_ID }] } }, facebook), "healthy");
  assert.equal(judgeHealthProbe({ ok: true, data: { data: [] } }, facebook), "resubscribe");
  assert.equal(judgeHealthProbe({ ok: true, data: { id: "178414" } }, { checkSubscription: false, appId: APP_ID }), "healthy", "unified rows only check the token");
  assert.equal(judgeHealthProbe({ ok: false, status: 400, error: { code: 190 } }, facebook), "revoked");
  assert.equal(judgeHealthProbe({ ok: false, status: 400, error: { code: 102 } }, facebook), "revoked");
  assert.equal(judgeHealthProbe({ ok: false, status: 401, error: null }, facebook), "revoked");
  assert.equal(judgeHealthProbe({ ok: false, status: 0, error: null }, facebook), "transient", "network/timeout");
  assert.equal(judgeHealthProbe({ ok: false, status: 503, error: null }, facebook), "transient");
  assert.equal(judgeHealthProbe({ ok: false, status: 429, error: null }, facebook), "transient");
  assert.equal(judgeHealthProbe({ ok: false, status: 400, error: { code: 4 } }, facebook), "transient", "app rate limit");
  assert.equal(judgeHealthProbe({ ok: false, status: 400, error: { code: 200 } }, facebook), "error", "a permission problem is not a revoked token");
  assert.equal(
    judgeHealthProbe({ ok: false, status: 400, error: { code: 10, error_subcode: 2534022 } }, facebook),
    "error",
    "the outside-window code never disconnects an account",
  );
});

test("the health job is scheduled every 6 hours", () => {
  assert.match(read("lib/scheduler/jobs.ts"), /name: "instagram_health", schedule: \{ kind: "every", seconds: 6 \* 60 \* MINUTE \}[\s\S]*?run: runInstagramConnectionHealthCheck/);
});

test("Facebook Login rows are probed on /subscribed_apps with the stored token and re-subscribed with the connect flow's fields", () => {
  const source = read("lib/instagram-health.ts");
  assert.match(source, /graphRequest\("GET", `\/\$\{connection\.facebook_page_id\}\/subscribed_apps`, \{ token \}\)/);
  assert.match(source, /graphRequest\("POST", `\/\$\{connection\.facebook_page_id\}\/subscribed_apps`, \{\s*token,\s*form: \{ subscribed_fields: PAGE_SUBSCRIBED_FIELDS\.join\(","\) \},/);
  assert.match(source, /if \(verdict === "revoked"\) \{\s*await markInstagramConnectionRevoked\(supabase, connection\.business_id\);/);
  assert.match(source, /if \(verdict === "transient"\) \{\s*result\.transient\+\+;\s*continue;/, "a transient failure changes nothing");
});

test("the owner is alerted once, on the connected -> disconnected transition", () => {
  const lib = read("lib/instagram.ts");
  const mark = lib.slice(lib.indexOf("export async function markInstagramConnectionRevoked"), lib.indexOf("export async function getInstagramSendNode"));
  assert.match(mark, /\.eq\("status", "connected"\)\s*\.select\("id"\)/);
  assert.match(mark, /if \(changed && changed\.length > 0\) \{\s*await alertOwnerIntegrationDisconnected\(supabase, businessId, "instagram", "token_revoked"\);/);
});

test("no token ever reaches a log line or the alert email", () => {
  for (const file of ["lib/instagram-health.ts", "lib/integration-alerts.ts"]) {
    const source = read(file);
    for (const call of source.matchAll(/logEvent\(([^;]*?)\);/gs)) {
      assert.doesNotMatch(call[1], /\btoken\b/i, `${file}: ${call[1].slice(0, 80)}`);
    }
  }
  assert.doesNotMatch(read("lib/integration-alerts.ts"), /access_token|getInstagramAccessToken/);
});
