// Tests for the Instagram integration (Facebook Login mode + Unified Login mode):
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

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)

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
    message: "x",
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

test("access: the override changes only Instagram; Instagram has the same plan access as WhatsApp", () => {
  const starter = { website: true, whatsapp: false, instagram: false };
  assert.deepEqual(plans.applyChannelOverrides(starter, { instagramEnabled: true }), { website: true, whatsapp: false, instagram: true });
  for (const key of plans.PLAN_KEYS) assert.equal(plans.PLANS[key].channels.instagram, plans.PLANS[key].channels.whatsapp, key);
  assert.equal(plans.PLANS.starter.channels.instagram, false);
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

// ------------------------------------------------------- facebook login mode (Instagram API with Facebook Login)

const fbFlow = await import(new URL("../lib/meta-instagram-facebook-flow.ts", import.meta.url).href);

const SHORT_TOKEN = "EAAshort_user_token_SHOULD_NEVER_BE_LOGGED_aa11";
const LONG_TOKEN = "EAAlong_user_token_SHOULD_NEVER_BE_LOGGED_bb22";
const PAGE_TOKEN_1 = "EAApage_token_one_SHOULD_NEVER_BE_LOGGED_cc33";
const PAGE_TOKEN_2 = "EAApage_token_two_SHOULD_NEVER_BE_LOGGED_dd44";
const FB_USER_ID = "10223344556677889";
const PAGE_1 = "105000000000001";
const PAGE_2 = "105000000000002";
const PAGE_3 = "105000000000003";
const IG_2 = "17841400000000002";

const fbRoutes = (accounts) => ({
  "GET /oauth/access_token": (options) =>
    options.query.grant_type === "fb_exchange_token"
      ? ok({ access_token: LONG_TOKEN, token_type: "bearer", expires_in: 5183944 })
      : ok({ access_token: SHORT_TOKEN, token_type: "bearer" }),
  "GET /me": ok({ id: FB_USER_ID }),
  "GET /me/accounts": accounts,
});

async function runFbFlow(routes) {
  const calls = [];
  const lines = [];
  const graph = async (method, path, options = {}) => {
    calls.push({ method, path, options });
    const handler = routes[`${method} ${path}`];
    if (!handler) return graphFail(404, 803);
    return typeof handler === "function" ? handler(options) : handler;
  };
  const log = (event, metadata, level = "info") => lines.push(JSON.stringify({ event, businessId: "biz-1", level, ...metadata }));
  const result = await fbFlow.discoverFacebookPages({
    graph,
    log,
    appId: "1876820120425285",
    appSecret: APP_SECRET,
    redirectUri: "https://aipilot.waveswebstudio.in/api/meta/instagram/callback",
    code: AUTH_CODE,
  });
  return { result, calls, lines, events: lines.map((line) => JSON.parse(line).event) };
}

const assertNoFbSecrets = (lines) => {
  for (const line of lines) {
    for (const secret of [SHORT_TOKEN, LONG_TOKEN, PAGE_TOKEN_1, PAGE_TOKEN_2, AUTH_CODE, APP_SECRET, "SHOULD_NEVER_BE_LOGGED"]) {
      assert.ok(!line.includes(secret), `log line leaked a secret: ${line}`);
    }
  }
};

const linkedPage = (id, token, igId, username, name = `Page ${id.slice(-1)}`) => ({
  id,
  name,
  access_token: token,
  instagram_business_account: { id: igId, username },
});

test("facebook mode: login mode defaults to facebook; only 'unified' switches back", () => {
  assert.equal(rules.parseLoginMode(undefined), "facebook");
  assert.equal(rules.parseLoginMode(""), "facebook");
  assert.equal(rules.parseLoginMode("facebook"), "facebook");
  assert.equal(rules.parseLoginMode("unified"), "unified");
  assert.equal(rules.parseLoginMode(" Unified "), "unified");
  assert.equal(rules.parseLoginMode("something-else"), "facebook");
  assert.match(read("lib/meta-graph.ts"), /parseLoginMode\(process\.env\.META_IG_LOGIN_MODE\)/);
});

test("facebook mode: the login URL is www.facebook.com/dialog/oauth with client_id, config_id, redirect_uri, code and state", () => {
  const url = new URL(
    rules.buildFacebookLoginUrl({ appId: "1876820120425285", configId: "999000111", redirectUri: "https://x.test/cb", state: "s1" }),
  );
  assert.equal(url.origin + url.pathname, "https://www.facebook.com/dialog/oauth");
  assert.equal(url.searchParams.get("client_id"), "1876820120425285");
  assert.equal(url.searchParams.get("config_id"), "999000111");
  assert.equal(url.searchParams.get("redirect_uri"), "https://x.test/cb");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "s1");
  assert.equal(url.searchParams.get("prompt"), null);
  assert.equal(url.searchParams.get("scope"), null, "permissions come from the login configuration");
  const lib = read("lib/instagram.ts");
  assert.match(lib, /getMetaLoginMode\(\) === "unified" \? buildUnifiedLoginUrl\(loginInput\) : buildFacebookLoginUrl\(loginInput\)/);
});

test("facebook mode: one Page with Instagram -> code, long-lived exchange, /me, /me/accounts; Page token returned", async () => {
  const { result, calls, events, lines } = await runFbFlow(
    fbRoutes(ok({ data: [linkedPage(PAGE_1, PAGE_TOKEN_1, IG_ID, "waveswebstudio", "Waves Web Studio")] })),
  );
  assert.equal(result.ok, true);
  assert.equal(result.userToken, LONG_TOKEN);
  assert.equal(result.facebookUserId, FB_USER_ID);
  assert.deepEqual(result.pages, [
    { pageId: PAGE_1, pageName: "Waves Web Studio", pageToken: PAGE_TOKEN_1, igId: IG_ID, username: "waveswebstudio" },
  ]);
  assert.deepEqual(events, ["ig_connect_code_exchanged", "ig_connect_long_lived", "ig_connect_me", "ig_connect_pages"]);

  // Step 1: the code exchange uses redirect_uri; step 2 exchanges the short token for a long-lived one.
  assert.equal(calls[0].options.query.code, AUTH_CODE);
  assert.equal(calls[0].options.query.redirect_uri, "https://aipilot.waveswebstudio.in/api/meta/instagram/callback");
  assert.equal(calls[1].options.query.grant_type, "fb_exchange_token");
  assert.equal(calls[1].options.query.fb_exchange_token, SHORT_TOKEN);
  // /me and /me/accounts use the LONG-lived token (Page tokens from it do not expire).
  assert.equal(calls[2].options.token, LONG_TOKEN);
  const accountsCall = calls.find((call) => call.path === "/me/accounts");
  assert.equal(accountsCall.options.token, LONG_TOKEN);
  assert.equal(accountsCall.options.query.fields, "id,name,access_token,instagram_business_account{id,username}");
  assertNoFbSecrets(lines);
});

test("facebook mode: several Pages with Instagram -> all returned (chooser); Pages without Instagram are dropped", async () => {
  const { result, lines } = await runFbFlow(
    fbRoutes(
      ok({
        data: [
          linkedPage(PAGE_1, PAGE_TOKEN_1, IG_ID, "waveswebstudio"),
          { id: PAGE_3, name: "No IG Page", access_token: "EAAx_SHOULD_NEVER_BE_LOGGED" },
          linkedPage(PAGE_2, PAGE_TOKEN_2, IG_2, "wavesdemo"),
        ],
      }),
    ),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.pages.map((page) => [page.pageId, page.igId]), [[PAGE_1, IG_ID], [PAGE_2, IG_2]]);
  const pagesLine = JSON.parse(lines.find((line) => line.includes('"ig_connect_pages"')));
  assert.equal(pagesLine.pageCount, 3);
  assert.equal(pagesLine.linkedCount, 2);
  assertNoFbSecrets(lines);
});

test("facebook mode: /me/accounts paging is followed via the after cursor", async () => {
  let call = 0;
  const { result, calls } = await runFbFlow(
    fbRoutes((options) => {
      call += 1;
      if (call === 1) {
        assert.equal(options.query.after, undefined);
        return ok({
          data: [{ id: PAGE_3, name: "No IG", access_token: "t" }],
          paging: { cursors: { after: "CURSOR1" }, next: "https://graph.facebook.com/next" },
        });
      }
      assert.equal(options.query.after, "CURSOR1");
      return ok({ data: [linkedPage(PAGE_2, PAGE_TOKEN_2, IG_2, "wavesdemo")], paging: { cursors: { after: "CURSOR2" } } });
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.pages.map((page) => page.igId), [IG_2]);
  assert.equal(calls.filter((c) => c.path === "/me/accounts").length, 2);
});

test("facebook mode: zero Pages with Instagram -> no_linked_pages", async () => {
  const empty = await runFbFlow(fbRoutes(ok({ data: [] })));
  assert.deepEqual(empty.result, { ok: false, error: "no_linked_pages" });
  const unlinked = await runFbFlow(fbRoutes(ok({ data: [{ id: PAGE_3, name: "Plain Page", access_token: "EAAz_SHOULD_NEVER_BE_LOGGED" }] })));
  assert.deepEqual(unlinked.result, { ok: false, error: "no_linked_pages" });
  assert.equal(unlinked.events.at(-1), "ig_connect_failed");
  assertNoFbSecrets(unlinked.lines);
});

test("facebook mode: each failing step has its own code (exchange, long-lived, me, pages)", async () => {
  const exchange = await runFbFlow({ "GET /oauth/access_token": graphFail(400, 100, "TraceFb") });
  assert.deepEqual(exchange.result, { ok: false, error: "exchange_failed" });
  assert.equal(exchange.calls.length, 1);
  const line = JSON.parse(exchange.lines[0]);
  assert.equal(line.step, "code_exchange");
  assert.equal(line.metaCode, 100);
  assert.equal(line.fbtraceId, "TraceFb");

  const longLived = await runFbFlow({
    "GET /oauth/access_token": (options) =>
      options.query.grant_type === "fb_exchange_token" ? graphFail(400, 190) : ok({ access_token: SHORT_TOKEN }),
  });
  assert.deepEqual(longLived.result, { ok: false, error: "long_lived_failed" });

  const me = await runFbFlow({ ...fbRoutes(ok({ data: [] })), "GET /me": graphFail(400, 190) });
  assert.deepEqual(me.result, { ok: false, error: "me_failed" });

  const pages = await runFbFlow(fbRoutes(graphFail(403, 200)));
  assert.deepEqual(pages.result, { ok: false, error: "pages_failed" });

  for (const run of [exchange, longLived, me, pages]) assertNoFbSecrets(run.lines);
});

test("facebook mode: the dashboard has copy for every new error code, incl. a guide link for no_linked_pages", () => {
  const copy = read("app/(dashboard)/dashboard/instagram/instagram-oauth-result.tsx");
  for (const code of ["long_lived_failed", "pages_failed", "no_linked_pages"]) assert.match(copy, new RegExp(`\\b${code}:`), code);
  assert.match(copy, /Link your Instagram professional account to a Facebook Page, then try again/);
  assert.match(copy, /href="#before-you-connect"/);
  assert.match(read("app/(dashboard)/dashboard/instagram/instagram-setup-guide.tsx"), /id="before-you-connect"/);
});

test("facebook mode: the Page is subscribed with its Page token and Page-valid fields before anything is stored", () => {
  // Only links the Page to the app ("subscribing to any Page field", documented example `feed`).
  assert.deepEqual([...rules.PAGE_SUBSCRIBED_FIELDS], ["feed"]);
  // Messenger fields need pages_messaging, which we do not request: none may be sent.
  const messengerFields = ["messages", "message_reactions", "message_echoes", "message_reads", "messaging_postbacks", "messaging_referrals", "standby", "messaging_handovers"];
  for (const field of rules.PAGE_SUBSCRIBED_FIELDS) assert.ok(!messengerFields.includes(field), field);

  const lib = read("lib/instagram.ts");
  const connect = lib.slice(lib.indexOf("async function connectFacebookPage("), lib.indexOf("async function connectUnifiedAccount("));
  assert.match(connect, /subscribeFacebookPage\(\{[\s\S]*?userToken,\s*page,\s*\}\)/);
  assert.match(connect, /if \(!subscribed\.ok\) return \{ kind: "error", error: subscribed\.error \}/);
  assert.ok(connect.indexOf("subscribeFacebookPage(") < connect.indexOf("saveConnection("));
  assert.match(connect, /saveConnection\(businessId, userId, page\.pageToken,/);
  assert.match(connect, /facebookUserId,\s*facebookPageId: page\.pageId,/);
});

test("facebook mode: one Page connects directly, several park the encrypted USER token for the chooser", () => {
  const lib = read("lib/instagram.ts");
  const complete = lib.slice(lib.indexOf("export async function completeInstagramConnect("), lib.indexOf("async function parkSelection("));
  assert.match(complete, /if \(getMetaLoginMode\(\) === "facebook"\)/);
  assert.match(complete, /pages\.length === 1[\s\S]*?connectFacebookPage\(businessId, userId, facebookUserId, userToken, pages\[0\]\)/);
  assert.match(complete, /parkSelection\(businessId, userId, userToken, \{\s*loginMode: "facebook"/);
  // The chooser stores Page name + username, never a Page token.
  assert.match(complete, /\{ id: page\.igId, username: page\.username, pageId: page\.pageId, pageName: page\.pageName \}/);
  const finish = lib.slice(lib.indexOf("export async function finishInstagramSelection("), lib.indexOf("async function connectFacebookPage("));
  assert.match(finish, /graphRequest<unknown>\("GET", `\/\$\{account\.pageId\}`, \{ token, query: \{ fields: PAGE_FIELDS \} \}\)/);
  assert.match(finish, /linked\.igId !== account\.id/);
  const chooser = read("app/(dashboard)/dashboard/instagram/choose-instagram-account.tsx");
  assert.match(chooser, /Facebook Page: \{account\.pageName\}/);
});

test("facebook mode: replies go to POST /<PAGE_ID>/messages with the stored Page token; unified rows keep /<IG_ID>", () => {
  assert.equal(rules.instagramGraphNode({ login_mode: "facebook", instagram_business_account_id: IG_ID, facebook_page_id: PAGE_1 }), PAGE_1);
  assert.equal(rules.instagramGraphNode({ login_mode: "unified", instagram_business_account_id: IG_ID, facebook_page_id: null }), IG_ID);
  assert.equal(rules.instagramGraphNode({ login_mode: "facebook", instagram_business_account_id: IG_ID, facebook_page_id: null }), null);
  assert.equal(rules.instagramGraphNode({ login_mode: "facebook", instagram_business_account_id: IG_ID, facebook_page_id: "1/../x" }), null);

  const delivery = read("lib/instagram-delivery.ts");
  const deliver = delivery.slice(delivery.indexOf("async function deliverInstagramOutboundRow("));
  assert.ok(deliver.indexOf("getInstagramAccessToken(") < deliver.indexOf("graphRequest<"));
  assert.ok(deliver.indexOf("getInstagramSendNode(") < deliver.indexOf("graphRequest<"));
  assert.match(
    deliver,
    /`\/\$\{sendNode\}\/messages`,\s*\{\s*token,\s*json: \{ recipient: \{ id: outbound\.to_ig_id \}, message: \{ text: outbound\.content \} \}/,
  );
  // 24h window and code-190 handling still sit on the same path.
  assert.ok(deliver.indexOf("isWithinMessagingWindow(") < deliver.indexOf("graphRequest<"));
  assert.match(deliver, /if \(isRevokedTokenError\(result\.status, result\.error\)\)/);
});

test("facebook mode: disconnect unsubscribes the Page, deletes token + connection, keeps conversations", () => {
  const lib = read("lib/instagram.ts");
  const disconnect = lib.slice(
    lib.indexOf("export async function disconnectInstagram("),
    lib.indexOf("export async function resolveBusinessFromInstagramAccountId("),
  );
  assert.match(disconnect, /instagramGraphNode\(connection\)/);
  assert.match(disconnect, /graphRequest\("DELETE", `\/\$\{node\}\/subscribed_apps`, \{ token \}\)/);
  assert.match(disconnect, /from\("instagram_credentials"\)\.delete\(\)/);
  assert.match(disconnect, /from\("instagram_connections"\)\s*\.delete\(\)/);
  assert.doesNotMatch(disconnect, /from\("conversations"\)/);
});

test("facebook mode: deauthorize / data deletion match the signed_request user_id against the stored Facebook user id (plus existing ids)", () => {
  assert.equal(
    rules.metaCallbackMatchFilter(FB_USER_ID),
    [
      `facebook_user_id.eq.${FB_USER_ID}`,
      `meta_system_user_id.eq.${FB_USER_ID}`,
      `client_business_id.eq.${FB_USER_ID}`,
      `instagram_business_account_id.eq.${FB_USER_ID}`,
      `facebook_page_id.eq.${FB_USER_ID}`,
    ].join(","),
  );
  for (const bad of ["1,id.neq.0", "abc", "", "1)"]) assert.throws(() => rules.metaCallbackMatchFilter(bad), bad);
  const deletion = read("lib/instagram-data-deletion.ts");
  assert.match(deletion, /\.or\(metaCallbackMatchFilter\(metaUserId\)\)/);
  assert.match(read("app/api/meta/deauthorize/route.ts"), /deauthorizeInstagramUser\(createServiceSupabaseClient\(\), verified\.userId\)/);
  // The Facebook user id is stored at connect time.
  assert.match(read("lib/instagram.ts"), /facebook_user_id: ids\.facebookUserId,/);
});

test("facebook mode: migration adds login_mode + Facebook ids and grants nothing new", () => {
  const migration = read("supabase/migrations/20261114000000_instagram_facebook_login.sql");
  assert.match(migration, /add column login_mode text not null default 'unified'\s*check \(login_mode in \('unified', 'facebook'\)\)/);
  for (const column of ["facebook_user_id", "facebook_page_id", "facebook_page_name"]) assert.match(migration, new RegExp(`add column ${column} text`));
  assert.match(migration, /alter column meta_system_user_id drop not null/);
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /\bgrant\b/i);
});

test("hygiene: the Facebook flow's log calls never pass a token, the code or the secret", () => {
  const source = read("lib/meta-instagram-facebook-flow.ts");
  const calls = source.match(/\blog\(\s*"ig_connect_[a-z_]+"[\s\S]*?\);/g) ?? [];
  assert.ok(calls.length >= 8, `found ${calls.length}`);
  for (const call of calls) {
    assert.doesNotMatch(call, /userToken|pageToken|access_token\b|appSecret|input\.code|exchanged\.data|longLived\.data\.access_token/, call);
  }
  assert.doesNotMatch(source, /graph\.instagram\.com/);
});

test("facebook mode: a subscribe refused for a missing permission (pages_manage_metadata) logs a clear reason and returns subscribe_permission", () => {
  assert.equal(rules.isPermissionError({ code: 200 }), true);
  assert.equal(rules.isPermissionError({ code: 210 }), true);
  assert.equal(rules.isPermissionError({ code: 10 }), true);
  assert.equal(rules.isPermissionError({ code: 10, error_subcode: 2534022 }), false, "outside-window is not a permission error");
  assert.equal(rules.isPermissionError({ code: 190 }), false);
  assert.equal(rules.isPermissionError(null), false);
  assert.match(read("app/(dashboard)/dashboard/instagram/instagram-oauth-result.tsx"), /\bsubscribe_permission:/);
});

// ------------------------------------------------------- facebook mode: Page subscribe step

const fbPage = { pageId: PAGE_1, pageName: "Waves", pageToken: PAGE_TOKEN_1, igId: IG_ID, username: "waveswebstudio" };
const permissionsOk = ok({
  data: [
    { permission: "pages_show_list", status: "granted" },
    { permission: "pages_manage_metadata", status: "granted" },
    { permission: "instagram_manage_messages", status: "granted" },
    { permission: "pages_messaging", status: "declined" },
  ],
});
const metaFail = (status, code, message, error_user_msg) => ({
  ok: false,
  status,
  error: rules.readGraphError({ error: { code, type: "OAuthException", message, error_user_msg, fbtrace_id: "AH31enm" } }),
});

async function runSubscribe(routes) {
  const calls = [];
  const lines = [];
  const graph = async (method, path, options = {}) => {
    calls.push({ method, path, options });
    const handler = routes[`${method} ${path}`];
    if (!handler) return graphFail(404, 803);
    return typeof handler === "function" ? handler(options) : handler;
  };
  const log = (event, metadata, level = "info") => lines.push(JSON.stringify({ event, level, ...metadata }));
  const result = await fbFlow.subscribeFacebookPage({ graph, log, userToken: LONG_TOKEN, page: fbPage });
  return { result, calls, lines, parsed: lines.map((line) => JSON.parse(line)) };
}

test("facebook subscribe: POST /<PAGE_ID>/subscribed_apps uses the PAGE token, never the user token", async () => {
  const { result, calls, parsed, lines } = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: ok({ success: true }),
  });
  assert.deepEqual(result, { ok: true });
  const subscribe = calls.find((call) => call.path === `/${PAGE_1}/subscribed_apps`);
  assert.equal(subscribe.method, "POST");
  assert.equal(subscribe.options.token, PAGE_TOKEN_1);
  assert.notEqual(subscribe.options.token, LONG_TOKEN);
  assert.equal(subscribe.options.form.subscribed_fields, "feed");
  // /me/permissions is the only call made with the user token.
  assert.deepEqual(calls.filter((call) => call.options.token === LONG_TOKEN).map((call) => call.path), ["/me/permissions"]);
  assert.deepEqual(parsed.map((line) => line.event), ["ig_connect_permissions", "ig_connect_subscribed"]);
  assertNoFbSecrets(lines);
});

test("facebook subscribe: granted/declined permission names are logged before subscribing", async () => {
  const { calls, parsed, lines } = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: ok({ success: true }),
  });
  assert.equal(calls[0].path, "/me/permissions");
  const perms = parsed.find((line) => line.event === "ig_connect_permissions");
  assert.equal(perms.granted, "pages_show_list,pages_manage_metadata,instagram_manage_messages");
  assert.equal(perms.declined, "pages_messaging");
  assertNoFbSecrets(lines);
});

test("facebook subscribe: a /me/permissions failure is logged but does not block the subscribe", async () => {
  const { result, parsed } = await runSubscribe({
    "GET /me/permissions": graphFail(400, 190),
    [`POST /${PAGE_1}/subscribed_apps`]: ok({ success: true }),
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(parsed[0].event, "ig_connect_permissions_failed");
});

test("facebook subscribe: failure logs Meta's message + user message; reason names a permission only if Meta does", async () => {
  const generic = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: metaFail(403, 200, "(#200) Permissions error", "You need a role on this Page."),
  });
  assert.deepEqual(generic.result, { ok: false, error: "subscribe_permission" });
  const failed = generic.parsed.find((line) => line.event === "ig_connect_failed");
  assert.equal(failed.reason, "subscribe_failed");
  assert.equal(failed.metaMessage, "(#200) Permissions error");
  assert.equal(failed.metaUserMessage, "You need a role on this Page.");
  assert.equal(failed.metaCode, 200);
  assert.equal(failed.status, 403);

  const named = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: metaFail(
      403,
      200,
      "(#200) To subscribe to the messages field, one of these permissions is needed: pages_messaging",
    ),
  });
  assert.equal(named.parsed.find((line) => line.event === "ig_connect_failed").reason, "missing_permission_pages_messaging");

  const metadata = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: metaFail(403, 200, "Requires pages_manage_metadata permission"),
  });
  assert.equal(metadata.parsed.find((line) => line.event === "ig_connect_failed").reason, "missing_permission_pages_manage_metadata");

  const nonPermission = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: metaFail(400, 100, "Invalid parameter"),
  });
  assert.deepEqual(nonPermission.result, { ok: false, error: "subscribe_failed" });
  for (const run of [generic, named, metadata, nonPermission]) assertNoFbSecrets(run.lines);
});

test("facebook subscribe: a token echoed inside Meta's message is redacted before it is logged", async () => {
  const { lines } = await runSubscribe({
    "GET /me/permissions": permissionsOk,
    [`POST /${PAGE_1}/subscribed_apps`]: metaFail(400, 190, `Bad token ${PAGE_TOKEN_1} and ${LONG_TOKEN}`, `x ${"A".repeat(60)}`),
  });
  assertNoFbSecrets(lines);
  assert.ok(!lines.join("").includes("A".repeat(60)));
  assert.match(lines.join(""), /\[redacted\]/);
  assert.equal(rules.sanitizeMetaText("a".repeat(400)).length <= 301, true);
  assert.equal(rules.sanitizeMetaText(42), undefined);
});

test("hygiene: the subscribe step's log calls never pass a token", () => {
  const source = read("lib/meta-instagram-facebook-flow.ts");
  const body = source.slice(source.indexOf("export async function subscribeFacebookPage("));
  const calls = body.match(/\blog\(\s*"ig_connect_[a-z_]+"[\s\S]*?\);/g) ?? [];
  assert.ok(calls.length >= 4, `found ${calls.length}`);
  for (const call of calls) assert.doesNotMatch(call, /userToken|pageToken|access_token\b/, call);
});

// ------------------------------------------------------- reply latency (2026-11-02)

const replyTiming = await import(new URL("../lib/instagram-reply-timing.ts", import.meta.url).href);

test("timing: ig_reply_timing sums the widget's stage names and keeps the milestones", () => {
  const line = replyTiming.summarizeInstagramReplyTiming({
    conversationId: "c1",
    milestones: { signatureVerifiedAtMs: 2, messageSavedAtMs: 310, backgroundStartedAtMs: 330, contextLoadedAtMs: 400, llmCompleteAtMs: 2100, metaSendReturnedAtMs: 2600 },
    stages: [
      { stage: "embedding_prefetch", ms: 380 },
      { stage: "embedding", ms: 20 },
      { stage: "vector_search", ms: 70 },
      { stage: "instant_local", ms: 5 },
      { stage: "model_call_1", ms: 900 },
      { stage: "tool_batch_1", ms: 150, tools: ["check_product_details"] },
      { stage: "model_call_2", ms: 700 },
      { stage: "meta_send", ms: 450 },
    ],
    totalMs: 2650,
    model: "gemini-x",
    outcome: "ai",
    sent: true,
    metaDeliveryLagMs: 800,
  });
  assert.equal(line.llmFirstCallMs, 900);
  assert.equal(line.llmCalls, 2);
  assert.equal(line.llmMs, 1600);
  assert.equal(line.toolMs, 150);
  assert.equal(line.embeddingPrefetchMs, 380);
  assert.equal(line.embeddingWaitMs, 20);
  assert.equal(line.vectorSearchMs, 70);
  assert.equal(line.sendMs, 450);
  assert.equal(line.metaSendReturnedAtMs, 2600);
  assert.equal(line.totalMs, 2650);
  assert.equal(line.metaDeliveryLagMs, 800);
  // Flat values only (LogMetadata), and nothing that could be message text.
  for (const value of Object.values(line)) assert.ok(value === null || ["string", "number", "boolean"].includes(typeof value));
  assert.deepEqual(Object.keys(line).filter((key) => /token|answer|question|content|messageText|body/i.test(key)), []);
});

test("timing: an instant answer has no model call and a null first-call time", () => {
  const line = replyTiming.summarizeInstagramReplyTiming({
    conversationId: "c1",
    milestones: { signatureVerifiedAtMs: 1, messageSavedAtMs: 200, backgroundStartedAtMs: 210, contextLoadedAtMs: 260, llmCompleteAtMs: 280, metaSendReturnedAtMs: 700 },
    stages: [{ stage: "instant_local", ms: 12 }],
    totalMs: 710,
    model: null,
    outcome: "instant",
    sent: true,
    metaDeliveryLagMs: 800,
  });
  assert.equal(line.llmFirstCallMs, null);
  assert.equal(line.llmCalls, 0);
  assert.equal(line.instantCheckMs, 12);
});

test("latency: the Instagram reply uses the widget's speed-ups (one timer, cached embedding, instant answers, deferred metrics)", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  assert.ok(route.indexOf("const receivedAt = Date.now();") < route.indexOf("request.text()"), "the clock starts when the webhook arrives");
  assert.match(route, /new TurnTimer\(receivedAt\)/);
  assert.match(route, /embedQueryWithCache\(supabase, businessId, prepared\.text\)/);
  const ask = route.slice(route.indexOf("await askSalesEmployee("), route.indexOf("milestones.llmCompleteAtMs"));
  assert.match(ask, /timer,\s*quota,\s*prefetch\.queryEmbedding,\s*instant,\s*\/\/[^\n]*\n\s*true,\s*"webhook_instagram",\s*businessContext\.liveSource/);
  assert.match(route, /writeDeferredTurnMetrics\(supabase, metricsDraft, timer\)/);
  assert.match(route, /const HISTORY_LIMIT = 20;/);
  // The gate reads start during ingest, before the conversation lookup and the message write.
  const ingest = route.slice(route.indexOf("async function ingestInboundMessage("), route.indexOf("async function replyToInboundMessage("));
  for (const read of ["loadBusinessAiContext(businessId)", "canAgentServe(businessId)", "checkReplyQuota(supabase, businessId)"]) {
    assert.ok(ingest.indexOf(read) > ingest.indexOf('.from("instagram_inbound_messages")'), `${read} starts only after dedup`);
    assert.ok(ingest.indexOf(read) < ingest.indexOf("getOrCreateInstagramConversation("), `${read} overlaps the conversation lookup`);
  }
  assert.ok(ingest.indexOf("embedQueryWithCache(") > ingest.indexOf('checkAndIncrementRateLimit("conversation"'), "no embedding before every rate limit passes");
});

test("latency: follow-up work runs after the Send API call, and one ig_reply_timing line is logged", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  const answer = route.slice(route.indexOf("async function answerInboundMessage("), route.indexOf("async function sendCannedReply("));
  const send = answer.indexOf("const sendResult = await sendReply(");
  assert.ok(send > answer.indexOf("await askSalesEmployee("));
  for (const later of ['.from("unanswered_questions")', "flagConversationNeedsAttention(supabase, businessId, conversation.id, businessContext.clerkOrgId);\n    logEvent", "writeDeferredTurnMetrics(", "sendUsageReminderIfDue("]) {
    assert.ok(answer.indexOf(later) > send, `${later} must run after the reply is sent`);
  }
  assert.equal((route.match(/logEvent\(\s*"ig_reply_timing"/g) ?? []).length, 1);
  assert.match(route, /finally \{\s*logEvent\(\s*"ig_reply_timing"/);
});

test("perceived speed: mark_seen + typing_on fire once a reply is certain, never awaited on the reply path", () => {
  const route = read("app/api/meta/instagram/webhook/route.ts");
  const answer = route.slice(route.indexOf("async function answerInboundMessage("), route.indexOf("async function sendCannedReply("));
  const typing = answer.indexOf('background.push(sendInstagramSenderActions(supabase, businessId, inbound.senderId, ["mark_seen", "typing_on"]))');
  assert.ok(typing > 0, "fired into the background list, not awaited");
  assert.ok(typing > answer.indexOf('conversation.control === "human"'));
  assert.ok(typing > answer.indexOf("if (!agentServing)"));
  assert.ok(typing > answer.indexOf("if (!contextResult.ok)"));
  assert.ok(typing < answer.indexOf("await askSalesEmployee("));
  assert.doesNotMatch(answer, /await sendInstagramSenderActions\(/);

  const delivery = read("lib/instagram-delivery.ts");
  const actions = delivery.slice(delivery.indexOf("export async function sendInstagramSenderActions("));
  // Meta: only `recipient` and `sender_action`, to the same /<node>/messages edge, Page token.
  assert.match(actions, /json: \{ recipient: \{ id: toIgId \}, sender_action: action \}/);
  assert.match(actions, /`\/\$\{sendNode\}\/messages`/);
  assert.match(actions, /\} catch \{/);
});

test("latency: the send path reads its four gates in one parallel round trip, still in order, and skips the row read-back", () => {
  const delivery = read("lib/instagram-delivery.ts");
  const deliver = delivery.slice(delivery.indexOf("async function deliverInstagramOutboundRow("));
  assert.match(deliver, /const \[allowed, lastInbound, token, sendNode\] = await Promise\.all\(\[/);
  assert.ok(deliver.indexOf("if (!allowed)") < deliver.indexOf("if (!isWithinMessagingWindow("));
  assert.ok(deliver.indexOf("if (!isWithinMessagingWindow(") < deliver.indexOf("if (!token)"));
  assert.ok(deliver.indexOf("if (!sendNode)") < deliver.indexOf("graphRequest<"));
  const route = read("app/api/meta/instagram/webhook/route.ts");
  assert.match(route, /deliverInstagramOutbound\(outbound, supabase\)/);
  assert.doesNotMatch(route, /sendInstagramOutboundMessage\(/);
});

test("timing: Meta's event timestamp is kept (when present) for the delivery-lag figure", () => {
  const withTime = rules.extractInboundMessages(entry([{ sender: { id: "S1" }, timestamp: 1730000000000, message: { mid: "m1", text: "hi" } }]));
  assert.equal(withTime[0].sentAtMs, 1730000000000);
  const bad = rules.extractInboundMessages(entry([{ sender: { id: "S1" }, timestamp: "soon", message: { mid: "m2", text: "hi" } }]));
  assert.equal("sentAtMs" in bad[0], false);
});
