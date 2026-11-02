// Tests for the Instagram API with Unified Login integration:
// lib/meta-instagram-rules.ts (pure rules) and lib/token-crypto.ts, plus
// structural checks on the routes and send path that need Next/Supabase to
// run for real. Node's built-in runner, same approach as
// scripts/run-meta-signed-request-tests.mjs. No network, no database.
//
// Signatures are built here with node:crypto from Meta's documented format
// (`sha256=` + hex HMAC-SHA256 of the raw body, keyed with the app secret),
// not by calling the module under test.
//
// Run: npm run test:meta-instagram
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/meta-instagram-rules.ts", import.meta.url).href);
const tokenCrypto = await import(new URL("../lib/token-crypto.ts", import.meta.url).href);

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const SECRET = "test_meta_app_secret_123";
const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
const BODY = JSON.stringify({
  object: "instagram",
  entry: [{ id: "17841430994909784", time: 1, messaging: [{ sender: { id: "999" }, recipient: { id: "17841430994909784" }, message: { mid: "m1", text: "hi" } }] }],
});

// ------------------------------------------------------- webhook signature

test("signature: a valid X-Hub-Signature-256 is accepted", () => {
  assert.equal(rules.verifyWebhookSignature(BODY, sign(BODY), SECRET), true);
});

test("signature: a tampered body is rejected", () => {
  assert.equal(rules.verifyWebhookSignature(BODY.replace("hi", "HI"), sign(BODY), SECRET), false);
});

test("signature: a tampered signature is rejected", () => {
  const good = sign(BODY);
  const flipped = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
  assert.equal(rules.verifyWebhookSignature(BODY, flipped, SECRET), false);
});

test("signature: signed with the wrong secret is rejected", () => {
  assert.equal(rules.verifyWebhookSignature(BODY, sign(BODY, "some_other_secret"), SECRET), false);
});

test("signature: missing header, missing secret, wrong prefix, non-hex and short values are rejected", () => {
  assert.equal(rules.verifyWebhookSignature(BODY, null, SECRET), false);
  assert.equal(rules.verifyWebhookSignature(BODY, sign(BODY), undefined), false);
  assert.equal(rules.verifyWebhookSignature(BODY, sign(BODY).replace("sha256=", "sha1="), SECRET), false);
  assert.equal(rules.verifyWebhookSignature(BODY, "sha256=" + "z".repeat(64), SECRET), false);
  assert.equal(rules.verifyWebhookSignature(BODY, "sha256=abcd", SECRET), false);
});

// ------------------------------------------------------- GET verification

test("verification: matching token + subscribe returns the challenge", () => {
  assert.equal(
    rules.resolveVerificationChallenge({ mode: "subscribe", token: "verify-me-please-123", challenge: "42" }, "verify-me-please-123"),
    "42",
  );
});

test("verification: wrong token, wrong mode, missing challenge or unset env all refuse", () => {
  const ok = { mode: "subscribe", token: "verify-me-please-123", challenge: "42" };
  assert.equal(rules.resolveVerificationChallenge({ ...ok, token: "nope" }, "verify-me-please-123"), null);
  assert.equal(rules.resolveVerificationChallenge({ ...ok, mode: "unsubscribe" }, "verify-me-please-123"), null);
  assert.equal(rules.resolveVerificationChallenge({ ...ok, challenge: null }, "verify-me-please-123"), null);
  assert.equal(rules.resolveVerificationChallenge(ok, undefined), null);
  assert.equal(rules.resolveVerificationChallenge({ ...ok, token: null }, "verify-me-please-123"), null);
});

// ------------------------------------------------------- OAuth state

test("state: an unexpired row is usable and yields its own business and user", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const row = { business_id: "biz-a", initiated_by_user_id: "user_a", expires_at: "2026-11-02T10:05:00Z" };
  assert.deepEqual(rules.checkOAuthState(row, now), { ok: true, businessId: "biz-a", userId: "user_a" });
});

test("state: missing (unknown or already used) and expired rows are refused", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  assert.deepEqual(rules.checkOAuthState(null, now), { ok: false, reason: "missing" });
  const expired = { business_id: "biz-a", initiated_by_user_id: "user_a", expires_at: "2026-11-02T10:00:00Z" };
  assert.deepEqual(rules.checkOAuthState(expired, now), { ok: false, reason: "expired" });
});

test("state: the login URL carries client_id, config_id, redirect_uri, code, prompt=login and the state", () => {
  const url = new URL(
    rules.buildUnifiedLoginUrl({ appId: "1876820120425285", configId: "1445378207559361", redirectUri: "https://x.test/cb", state: "s1" }),
  );
  assert.equal(url.origin + url.pathname, "https://www.facebook.com/dialog/oauth");
  assert.equal(url.searchParams.get("client_id"), "1876820120425285");
  assert.equal(url.searchParams.get("config_id"), "1445378207559361");
  assert.equal(url.searchParams.get("redirect_uri"), "https://x.test/cb");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("prompt"), "login");
  assert.equal(url.searchParams.get("state"), "s1");
  assert.equal(url.searchParams.get("scope"), null, "permissions come from the login configuration");
});

test("state: the callback consumes the state before acting on a cancel, and the store is single-use", () => {
  const callback = read("app/api/meta/instagram/callback/route.ts");
  assert.ok(callback.indexOf("consumeInstagramOAuthState(") < callback.indexOf('fail("meta_dialog", "denied")'));
  assert.ok(callback.indexOf("consumeInstagramOAuthState(") < callback.indexOf("completeInstagramConnect("));
  const lib = read("lib/instagram.ts");
  assert.match(lib, /from\("instagram_oauth_states"\)\s*\.delete\(\)\s*\.eq\("state", state\)/);
});

// ------------------------------------------------------- inbound events

const entry = (messaging, id = "IG1") => ({ object: "instagram", entry: [{ id, messaging }] });

test("events: a text message is extracted with its account, sender and mid", () => {
  assert.deepEqual(rules.extractInboundMessages(entry([{ sender: { id: "S1" }, message: { mid: "m1", text: "hello" } }])), [
    { accountId: "IG1", senderId: "S1", mid: "m1", text: "hello" },
  ]);
});

test("events: echoes and our own sends are ignored", () => {
  assert.deepEqual(rules.extractInboundMessages(entry([{ sender: { id: "S1" }, message: { mid: "m1", text: "x", is_echo: true } }])), []);
  assert.deepEqual(rules.extractInboundMessages(entry([{ sender: { id: "IG1" }, message: { mid: "m2", text: "x" } }])), []);
});

test("events: a mid repeated in one payload is kept once", () => {
  const body = entry([
    { sender: { id: "S1" }, message: { mid: "dup", text: "a" } },
    { sender: { id: "S1" }, message: { mid: "dup", text: "a" } },
  ]);
  assert.equal(rules.extractInboundMessages(body).length, 1);
});

test("events: cross-delivery duplicates hit the unique dedup insert before any other write", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  const dedup = route.indexOf('.from("instagram_inbound_messages")');
  assert.ok(dedup > 0);
  assert.ok(dedup < route.indexOf("getOrCreateInstagramConversation("));
  assert.ok(dedup < route.indexOf("await createMessage("));
  assert.match(route, /dedupError\.code !== "23505"/);
});

test("events: non-text messages become text: null (stored only as a note), reads/reactions/postbacks are skipped", () => {
  const body = entry([
    { sender: { id: "S1" }, message: { mid: "m1", attachments: [{ type: "image", payload: { url: "https://x" } }] } },
    { sender: { id: "S1" }, read: { mid: "m0" } },
    { sender: { id: "S1" }, reaction: { mid: "m0", action: "react" } },
    { sender: { id: "S1" }, postback: { mid: "m3", title: "Hi" } },
  ]);
  assert.deepEqual(rules.extractInboundMessages(body), [{ accountId: "IG1", senderId: "S1", mid: "m1", text: null }]);
  assert.match(read("app/api/meta/instagram/webhook/route.ts"), /"\[Received a non-text message\]"/);
});

test("events: non-instagram objects and entries without an id are ignored", () => {
  assert.deepEqual(rules.extractInboundMessages({ ...entry([{ sender: { id: "S1" }, message: { mid: "m1", text: "x" } }]), object: "page" }), []);
  assert.deepEqual(rules.extractInboundMessages({ object: "instagram", entry: [{ messaging: [{ sender: { id: "S" }, message: { mid: "m", text: "x" } }] }] }), []);
});

test("webhook: signature is verified before the body is parsed; reply runs in after()", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  assert.ok(route.indexOf("verifyWebhookSignature(") < route.indexOf("JSON.parse("));
  assert.match(route, /process\.env\.META_APP_SECRET/);
  assert.match(route, /process\.env\.META_WEBHOOK_VERIFY_TOKEN/);
  assert.match(route, /status: 401/);
  assert.match(route, /after\(async \(\) => \{[\s\S]*?replyToInboundMessage\(/);
});

// ------------------------------------------------------- 24-hour window

test("window: inside 24h is allowed, exactly 24h is allowed, past 24h is not", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(rules.isWithinMessagingWindow("2026-11-02T11:00:00Z", now), true);
  assert.equal(rules.isWithinMessagingWindow("2026-11-01T12:00:00Z", now), true);
  assert.equal(rules.isWithinMessagingWindow("2026-11-01T11:59:59Z", now), false);
});

test("window: no inbound message or an unparseable time means no send", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(rules.isWithinMessagingWindow(null, now), false);
  assert.equal(rules.isWithinMessagingWindow("not a date", now), false);
});

test("window: the send path checks the window before calling Meta and flags the conversation", () => {
  const delivery = read("lib/instagram-delivery.ts");
  assert.ok(delivery.indexOf("isWithinMessagingWindow(") < delivery.indexOf('graphRequest<{ message_id?: string }>('));
  assert.match(delivery, /flagConversationNeedsAttention\(/);
  assert.doesNotMatch(delivery, /"HUMAN_AGENT"|tag: |messaging_type/);
  assert.match(delivery, /graph|graphRequest/);
});

test("window: Meta's own outside-window refusal is recognised and is not a revoked token", () => {
  const err = { code: 10, error_subcode: 2534022 };
  assert.equal(rules.isOutsideWindowError(err), true);
  assert.equal(rules.isRevokedTokenError(400, err), false);
});

// ------------------------------------------------------- revoked token

test("revoked: Graph code 190 and 102 are revoked tokens; other errors are not", () => {
  assert.equal(rules.isRevokedTokenError(400, { code: 190 }), true);
  assert.equal(rules.isRevokedTokenError(400, { code: 190, error_subcode: 460 }), true);
  assert.equal(rules.isRevokedTokenError(400, { code: 102 }), true);
  assert.equal(rules.isRevokedTokenError(400, { code: 100 }), false);
  assert.equal(rules.isRevokedTokenError(500, { code: 2 }), false);
  assert.equal(rules.isRevokedTokenError(401, null), true);
  assert.equal(rules.isRevokedTokenError(500, null), false);
});

test("revoked: readGraphError pulls code/subcode out of Meta's error body and ignores junk", () => {
  assert.deepEqual(rules.readGraphError({ error: { code: 190, error_subcode: 463, type: "OAuthException", message: "x" } }), {
    code: 190,
    error_subcode: 463,
    type: "OAuthException",
  });
  assert.equal(rules.readGraphError(null), null);
  assert.equal(rules.readGraphError({ nope: 1 }), null);
  assert.deepEqual(rules.readGraphError({ error: { code: "190" } }), { code: undefined, error_subcode: undefined, type: undefined });
});

test("revoked: the send path marks the connection disconnected and fails the row without retrying", () => {
  const delivery = read("lib/instagram-delivery.ts");
  const branch = delivery.slice(delivery.indexOf("if (isRevokedTokenError("), delivery.indexOf("if (isOutsideWindowError("));
  assert.match(branch, /failRow\(supabase, outbound\.id, "token_revoked"\)/);
  assert.match(branch, /markInstagramConnectionRevoked\(/);
  assert.match(branch, /return \{ success: false, reason: "token_revoked" \}/);
  const lib = read("lib/instagram.ts");
  const mark = lib.slice(lib.indexOf("export async function markInstagramConnectionRevoked"));
  assert.match(mark, /from\("instagram_credentials"\)\.delete\(\)/);
  assert.match(mark, /status: "disconnected"/);
});

// ------------------------------------------------------- token encryption

test("crypto: encrypt/decrypt round-trips and each encryption is unique", () => {
  const key = crypto.randomBytes(32);
  const a = tokenCrypto.encryptToken("EAAB-secret-token", key);
  const b = tokenCrypto.encryptToken("EAAB-secret-token", key);
  assert.notEqual(a, b);
  assert.ok(!a.includes("EAAB"));
  assert.equal(tokenCrypto.decryptToken(a, key), "EAAB-secret-token");
});

test("crypto: a tampered blob or the wrong key throws", () => {
  const key = crypto.randomBytes(32);
  const blob = tokenCrypto.encryptToken("token", key);
  const parts = blob.split(".");
  const ct = Buffer.from(parts[3], "base64url");
  ct[0] ^= 1;
  parts[3] = ct.toString("base64url");
  assert.throws(() => tokenCrypto.decryptToken(parts.join("."), key));
  assert.throws(() => tokenCrypto.decryptToken(blob, crypto.randomBytes(32)));
  assert.throws(() => tokenCrypto.decryptToken("plaintext-token", key));
});

test("crypto: keys parse from base64 or hex and must be 32 bytes", () => {
  const raw = crypto.randomBytes(32);
  assert.deepEqual(tokenCrypto.parseEncryptionKey(raw.toString("base64")), raw);
  assert.deepEqual(tokenCrypto.parseEncryptionKey(raw.toString("hex")), raw);
  assert.equal(tokenCrypto.parseEncryptionKey(crypto.randomBytes(16).toString("base64")), null);
  assert.equal(tokenCrypto.parseEncryptionKey(undefined), null);
});

// ------------------------------------------------------- hygiene

test("hygiene: no graph.instagram.com, no Instagram-Login scopes, no old INSTAGRAM_* env vars in app code", () => {
  for (const file of [
    "lib/instagram.ts",
    "lib/instagram-delivery.ts",
    "lib/meta-graph.ts",
    "app/api/meta/instagram/webhook/route.ts",
    "app/api/meta/instagram/callback/route.ts",
    "app/api/meta/instagram/connect/route.ts",
    "app/api/meta/data-deletion/route.ts",
    "app/api/meta/deauthorize/route.ts",
    "lib/env.ts",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /graph\.instagram\.com|instagram\.com\/oauth|instagram_business_basic|instagram_business_manage_messages/, file);
    assert.doesNotMatch(source, /INSTAGRAM_APP_|INSTAGRAM_OAUTH_|INSTAGRAM_WEBHOOK_/, file);
  }
  assert.match(read("lib/meta-graph.ts"), /https:\/\/graph\.facebook\.com\//);
});

test("hygiene: tokens travel in the Authorization header and are never passed to logEvent", () => {
  const graph = read("lib/meta-graph.ts");
  assert.match(graph, /Authorization = `Bearer \$\{options\.token\}`/);
  for (const file of ["lib/instagram.ts", "lib/instagram-delivery.ts", "lib/meta-graph.ts", "app/api/meta/instagram/webhook/route.ts", "app/api/meta/instagram/callback/route.ts"]) {
    const source = read(file);
    for (const call of source.match(/logEvent\([^;]*?\);/gs) ?? []) {
      // The event name may say "token" (e.g. instagram_token_revoked); the data must not carry one.
      const args = call.replace(/^logEvent\(\s*(?:"[a-z_]+"|[^,]+\?[^,]+:[^,]+),/, "");
      assert.doesNotMatch(args, /\btoken\b|access_?token|\btext\b|\bcontent\b|inboundContent/i, `${file}: ${call}`);
    }
  }
});

test("hygiene: the account subscription uses the documented fields on graph.facebook.com/<IG_ID>/subscribed_apps", () => {
  assert.deepEqual([...rules.SUBSCRIBED_FIELDS], ["messages", "messaging_postbacks", "message_reactions", "messaging_seen"]);
  const lib = read("lib/instagram.ts");
  assert.match(lib, /graphRequest<\{ success\?: boolean \}>\("POST", `\/\$\{account\.id\}\/subscribed_apps`/);
  assert.match(lib, /subscribed_fields: SUBSCRIBED_FIELDS\.join\(","\)/);
});

// ------------------------------------------------------- per-business access override

const plans = await import(new URL("../lib/plans.ts", import.meta.url).href);

test("access: Instagram is allowed when the plan includes it OR the business override is on", () => {
  const off = { website: true, whatsapp: true, instagram: false };
  const on = { website: true, whatsapp: true, instagram: true };
  assert.equal(plans.applyChannelOverrides(off, { instagramEnabled: false }).instagram, false);
  assert.equal(plans.applyChannelOverrides(off, { instagramEnabled: true }).instagram, true);
  assert.equal(plans.applyChannelOverrides(on, { instagramEnabled: false }).instagram, true);
  assert.equal(plans.applyChannelOverrides(on, { instagramEnabled: true }).instagram, true);
});

test("access: the override changes only Instagram, and no plan includes Instagram today", () => {
  const starter = { website: true, whatsapp: false, instagram: false };
  assert.deepEqual(plans.applyChannelOverrides(starter, { instagramEnabled: true }), { website: true, whatsapp: false, instagram: true });
  for (const key of plans.PLAN_KEYS) assert.equal(plans.PLANS[key].channels.instagram, false, key);
});

test("access: getEntitlement merges the override and reads it fail-closed", () => {
  const subscription = read("lib/subscription.ts");
  assert.match(subscription, /applyChannelOverrides\(planEntitlement\.channels, \{ instagramEnabled \}\)/);
  assert.match(subscription, /\.select\("instagram_enabled"\)[\s\S]*?if \(error\) \{[\s\S]*?return false;/);
  assert.match(subscription, /return data\?\.instagram_enabled === true;/);
});

test("access: every server path checks Instagram access before acting", () => {
  const connect = read("app/api/meta/instagram/connect/route.ts");
  assert.ok(connect.indexOf("entitlement.channels.instagram") < connect.indexOf("buildInstagramConnectUrl(businessId"));

  const callback = read("app/api/meta/instagram/callback/route.ts");
  assert.ok(callback.indexOf("isInstagramAllowed(") > callback.indexOf("consumeInstagramOAuthState(state)"));
  assert.ok(callback.indexOf("isInstagramAllowed(") < callback.indexOf("completeInstagramConnect("));

  const chooser = read("app/(dashboard)/dashboard/instagram/actions.ts");
  assert.ok(chooser.indexOf('isChannelEntitled(businessId, "instagram")') < chooser.indexOf("await finishInstagramSelection("));

  const webhook = read("app/api/meta/instagram/webhook/route.ts");
  const ingest = webhook.slice(webhook.indexOf("async function ingestInboundMessage("));
  assert.ok(ingest.indexOf("isInstagramAllowed(supabase, businessId)") < ingest.indexOf('.from("instagram_inbound_messages")'));
  assert.ok(ingest.indexOf("isInstagramAllowed(supabase, businessId)") < ingest.indexOf("createMessage("));

  const delivery = read("lib/instagram-delivery.ts");
  const deliver = delivery.slice(delivery.indexOf("async function deliverInstagramOutboundRow("));
  assert.ok(deliver.indexOf("isInstagramAllowed(supabase, outbound.business_id)") < deliver.indexOf("getInstagramAccessToken("));
  assert.ok(deliver.indexOf("isInstagramAllowed(supabase, outbound.business_id)") < deliver.indexOf("graphRequest<"));
});

test("access: the override migration leaves the column out of customer grants and blocks it on insert", () => {
  const migration = read("supabase/migrations/20261113000000_business_instagram_override.sql");
  assert.match(migration, /add column instagram_enabled boolean not null default false/);
  assert.match(migration, /as restrictive\s+for insert\s+to authenticated\s+with check \(instagram_enabled = false\)/);
  assert.doesNotMatch(migration, /grant update[^;]*instagram_enabled/i);
});

test("access: the admin and seed scripts carry no credentials and act on one resolved business", () => {
  for (const file of ["scripts/instagram-access.mjs", "scripts/seed-review-demo.mjs", "scripts/lib/owner-business.mjs"]) {
    const source = read(file);
    assert.doesNotMatch(source, /password\s*[:=]|sk_live_|sk_test_|eyJhbGci/i, file);
    assert.doesNotMatch(source, /console\.log\([^)]*process\.env/, file);
  }
  const seed = read("scripts/seed-review-demo.mjs");
  for (const call of seed.match(/\.(update|delete)\([^)]*\)[\s\S]*?;/g) ?? []) {
    assert.match(call, /\.eq\("(business_)?id", businessId\)/, call);
  }
});

// ------------------------------------------------------- connect flow (account discovery)

const flow = await import(new URL("../lib/meta-instagram-connect-flow.ts", import.meta.url).href);

const USER_TOKEN = "EAAG_user_token_SHOULD_NEVER_BE_LOGGED_9f8e7d";
const AUTH_CODE = "AQD_auth_code_SHOULD_NEVER_BE_LOGGED_1a2b3c";
const APP_SECRET = "app_secret_SHOULD_NEVER_BE_LOGGED_4d5e6f";
const IG_ID = "17841430994909784";
const ok = (data) => ({ ok: true, data });
const graphFail = (status, code, fbtrace_id = "AbCdEf123") => ({
  ok: false,
  status,
  error: { code, error_subcode: 33, type: "OAuthException", fbtrace_id },
});

/** Runs the flow against a fake Graph API; `routes` maps "<METHOD> <path>" to a response. */
async function runFlow(routes) {
  const calls = [];
  const lines = [];
  const graph = async (method, path, options = {}) => {
    calls.push({ method, path, options });
    const handler = routes[`${method} ${path}`];
    if (!handler) return graphFail(404, 803);
    return typeof handler === "function" ? handler(options) : handler;
  };
  const log = (event, metadata, level = "info") => lines.push(JSON.stringify({ event, businessId: "biz-1", level, ...metadata }));
  const result = await flow.discoverInstagramAccounts({
    graph,
    log,
    appId: "1876820120425285",
    appSecret: APP_SECRET,
    redirectUri: "https://aipilot.waveswebstudio.in/api/meta/instagram/callback",
    code: AUTH_CODE,
  });
  return { result, calls, lines, events: lines.map((line) => JSON.parse(line).event) };
}

const baseRoutes = {
  "GET /oauth/access_token": ok({ access_token: USER_TOKEN, token_type: "bearer" }),
  "GET /me": ok({ id: "122100000000000001", client_business_id: "998877" }),
};

const assertNoSecrets = (lines) => {
  for (const line of lines) {
    for (const secret of [USER_TOKEN, AUTH_CODE, APP_SECRET, "SHOULD_NEVER_BE_LOGGED"]) {
      assert.ok(!line.includes(secret), `log line leaked a secret: ${line}`);
    }
  }
};

test("connect flow: assigned accounts present -> used directly, no fallback", async () => {
  const { result, events, lines } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": ok({ data: [{ id: IG_ID, username: "waveswebstudio" }] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "assigned");
  assert.deepEqual(result.accounts, [{ id: IG_ID, username: "waveswebstudio" }]);
  assert.deepEqual(events, ["ig_connect_code_exchanged", "ig_connect_me", "ig_connect_assigned_accounts"]);
  assertNoSecrets(lines);
});

test("connect flow: empty assigned accounts -> debug_token granular_scopes fallback finds the account", async () => {
  const { result, events, lines, calls } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": ok({ data: [] }),
    "GET /debug_token": ok({
      data: {
        app_id: "1876820120425285",
        type: "SYSTEM_USER",
        is_valid: true,
        scopes: ["instagram_basic", "instagram_manage_messages", "business_management"],
        granular_scopes: [
          { scope: "instagram_basic", target_ids: [IG_ID] },
          { scope: "instagram_manage_messages", target_ids: [IG_ID] },
          { scope: "business_management" },
        ],
      },
    }),
    [`GET /${IG_ID}`]: ok({ id: IG_ID, username: "waveswebstudio" }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "debug_token");
  assert.equal(result.token, USER_TOKEN);
  assert.equal(result.systemUserId, "122100000000000001");
  assert.equal(result.clientBusinessId, "998877");
  assert.deepEqual(result.accounts, [{ id: IG_ID, username: "waveswebstudio" }]);
  assert.ok(events.includes("ig_connect_debug_token"));
  assert.ok(events.includes("ig_connect_fallback_used"));

  // debug_token: user token as input_token, app token only in the Authorization header (never in the URL).
  const debugCall = calls.find((call) => call.path === "/debug_token");
  assert.equal(debugCall.options.query.input_token, USER_TOKEN);
  assert.equal(debugCall.options.token, `1876820120425285|${APP_SECRET}`);
  assert.ok(!JSON.stringify(debugCall.options.query).includes(APP_SECRET));
  // Username lookup uses the user token.
  assert.equal(calls.find((call) => call.path === `/${IG_ID}`).options.token, USER_TOKEN);

  const debugLine = JSON.parse(lines.find((line) => line.includes('"ig_connect_debug_token"')));
  assert.equal(debugLine.isValid, true);
  assert.equal(debugLine.tokenType, "system_user");
  assert.equal(debugLine.instagramBasicIds, IG_ID);
  assert.match(debugLine.granularScopes, /instagram_basic:1/);
  assertNoSecrets(lines);
});

test("connect flow: assigned endpoint errors -> fallback still runs", async () => {
  const { result } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": graphFail(400, 100),
    "GET /debug_token": ok({ data: { is_valid: true, granular_scopes: [{ scope: "instagram_manage_messages", target_ids: [IG_ID] }] } }),
    [`GET /${IG_ID}`]: ok({ id: IG_ID, username: "waveswebstudio" }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "debug_token");
});

test("connect flow: both empty -> no_accounts, and the debug_token summary is logged", async () => {
  const { result, events, lines } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": ok({ data: [] }),
    "GET /debug_token": ok({
      data: { type: "SYSTEM_USER", is_valid: true, scopes: ["instagram_basic"], granular_scopes: [{ scope: "instagram_basic" }] },
    }),
  });
  assert.deepEqual(result, { ok: false, error: "no_accounts" });
  assert.equal(events.at(-1), "ig_connect_failed");
  const debugLine = JSON.parse(lines.find((line) => line.includes('"ig_connect_debug_token"')));
  assert.equal(debugLine.scopes, "instagram_basic");
  assert.equal(debugLine.granularScopes, "instagram_basic:0");
  assert.equal(debugLine.isValid, true);
  assertNoSecrets(lines);
});

test("connect flow: assigned errors and fallback empty -> accounts_failed (not no_accounts)", async () => {
  const { result } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": graphFail(400, 100),
    "GET /debug_token": graphFail(400, 190),
  });
  assert.deepEqual(result, { ok: false, error: "accounts_failed" });
});

test("connect flow: a fallback id whose lookup fails is not connected", async () => {
  const { result } = await runFlow({
    ...baseRoutes,
    "GET /me/assigned_instagram_accounts": ok({ data: [] }),
    "GET /debug_token": ok({ data: { granular_scopes: [{ scope: "instagram_basic", target_ids: [IG_ID] }] } }),
    [`GET /${IG_ID}`]: graphFail(400, 100),
  });
  assert.deepEqual(result, { ok: false, error: "no_accounts" });
});

test("connect flow: token exchange failure -> exchange_failed with Meta's error code, never no_accounts", async () => {
  const { result, calls, lines } = await runFlow({ "GET /oauth/access_token": graphFail(400, 100, "TraceXyz") });
  assert.deepEqual(result, { ok: false, error: "exchange_failed" });
  assert.equal(calls.length, 1);
  const line = JSON.parse(lines[0]);
  assert.equal(line.event, "ig_connect_failed");
  assert.equal(line.step, "code_exchange");
  assert.equal(line.status, 400);
  assert.equal(line.metaCode, 100);
  assert.equal(line.fbtraceId, "TraceXyz");
  assertNoSecrets(lines);
});

test("connect flow: a 200 exchange without a token is exchange_failed; /me failure is me_failed", async () => {
  assert.deepEqual((await runFlow({ "GET /oauth/access_token": ok({}) })).result, { ok: false, error: "exchange_failed" });
  const me = await runFlow({ "GET /oauth/access_token": baseRoutes["GET /oauth/access_token"], "GET /me": graphFail(400, 190) });
  assert.deepEqual(me.result, { ok: false, error: "me_failed" });
  assertNoSecrets(me.lines);
});

test("connect flow: the code exchange sends redirect_uri exactly as configured (= META_REDIRECT_URI)", async () => {
  const { calls } = await runFlow({ "GET /oauth/access_token": graphFail(400, 100) });
  assert.equal(calls[0].options.query.redirect_uri, "https://aipilot.waveswebstudio.in/api/meta/instagram/callback");
  assert.equal(calls[0].options.query.code, AUTH_CODE);
  assert.match(read("lib/instagram.ts"), /redirectUri: config\.redirectUri,/);
  assert.match(read("lib/meta-graph.ts"), /const redirectUri = process\.env\.META_REDIRECT_URI;/);
});

test("connect flow: the callback logs every step with ig_connect_* events and maps each failure to its own code", () => {
  const callback = read("app/api/meta/instagram/callback/route.ts");
  assert.match(callback, /logEvent\("ig_connect_start"/);
  assert.match(callback, /Sentry\.flush\(/);
  const lib = read("lib/instagram.ts");
  for (const event of ["ig_connect_saved", "ig_connect_subscribed", "ig_connect_choose", "ig_connect_failed"]) {
    assert.match(lib, new RegExp(`"${event}"`));
  }
  assert.match(lib, /error: "account_in_use"/);
  const copy = read("app/(dashboard)/dashboard/instagram/instagram-oauth-result.tsx");
  for (const code of ["exchange_failed", "me_failed", "accounts_failed", "no_accounts", "subscribe_failed", "account_in_use"]) {
    assert.match(copy, new RegExp(`\\b${code}:`), code);
  }
});

test("hygiene: the connect flow's log calls never pass the token, code or secret", () => {
  const source = read("lib/meta-instagram-connect-flow.ts");
  const calls = source.match(/\blog\(\s*"ig_connect_[a-z_]+"[\s\S]*?\);/g) ?? [];
  assert.ok(calls.length >= 8);
  for (const call of calls) {
    assert.doesNotMatch(call, /\btoken\b|access_token\b|appSecret|input\.code/, call);
  }
});
