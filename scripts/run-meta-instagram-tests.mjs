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
  assert.ok(callback.indexOf("consumeInstagramOAuthState(") < callback.indexOf('back("error=denied")'));
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
  for (const file of ["lib/instagram.ts", "lib/instagram-delivery.ts", "lib/meta-graph.ts", "app/api/meta/instagram/webhook/route.ts"]) {
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
