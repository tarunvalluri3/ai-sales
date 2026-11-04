// Tests for lib/meta-signed-request.ts -- the HMAC check on Meta's
// deauthorize / data-deletion callbacks. Node's built-in runner, same
// approach as scripts/run-razorpay-signature-tests.mjs. The module is pure
// (the secret is an argument), so it imports directly.
//
// Signed requests are built here with node:crypto from Meta's documented
// format (`base64url(hmac).base64url(payload)`, HMAC over the ENCODED
// payload), not by calling the module under test.
//
// Run: npm run test:meta-signed-request
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { verifyMetaSignedRequest } = await import(new URL("../lib/meta-signed-request.ts", import.meta.url).href);

const SECRET = "test_instagram_app_secret_123";
const WRONG_SECRET = "test_instagram_app_secret_124";

function sign(payload, secret = SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

const PAYLOAD = { algorithm: "HMAC-SHA256", user_id: "17841400000000000", issued_at: 1_700_000_000 };

test("valid signature is accepted and yields the user id", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign(PAYLOAD), SECRET), { ok: true, userId: "17841400000000000" });
});

test("a numeric user_id is accepted and normalised to a string", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign({ ...PAYLOAD, user_id: 12345 }), SECRET), {
    ok: true,
    userId: "12345",
  });
});

test("tampered payload is rejected", () => {
  const [signature] = sign(PAYLOAD).split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...PAYLOAD, user_id: "99999" })).toString("base64url");
  assert.deepEqual(verifyMetaSignedRequest(`${signature}.${forgedPayload}`, SECRET), { ok: false });
});

test("tampered signature is rejected", () => {
  const [signature, payload] = sign(PAYLOAD).split(".");
  const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.deepEqual(verifyMetaSignedRequest(`${flipped}.${payload}`, SECRET), { ok: false });
});

test("signature made with the wrong secret is rejected", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign(PAYLOAD, WRONG_SECRET), SECRET), { ok: false });
});

test("verifying with the wrong secret is rejected", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign(PAYLOAD), WRONG_SECRET), { ok: false });
});

test("missing secret or non-string input is rejected", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign(PAYLOAD), undefined), { ok: false });
  assert.deepEqual(verifyMetaSignedRequest(sign(PAYLOAD), ""), { ok: false });
  for (const bad of [undefined, null, 42, {}, ["a.b"]]) {
    assert.deepEqual(verifyMetaSignedRequest(bad, SECRET), { ok: false });
  }
});

test("malformed shapes are rejected", () => {
  for (const bad of ["", "nodot", "a.b.c", ".payload", "sig.", "!!!.???"]) {
    assert.deepEqual(verifyMetaSignedRequest(bad, SECRET), { ok: false });
  }
});

test("a correctly signed payload with another algorithm is rejected", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign({ ...PAYLOAD, algorithm: "HMAC-SHA1" }), SECRET), { ok: false });
});

test("a correctly signed payload with a missing or non-numeric user_id is rejected", () => {
  assert.deepEqual(verifyMetaSignedRequest(sign({ algorithm: "HMAC-SHA256" }), SECRET), { ok: false });
  for (const user_id of ["", "abc", "1,instagram_business_account_id.neq.0", "1)", "9".repeat(40)]) {
    assert.deepEqual(verifyMetaSignedRequest(sign({ ...PAYLOAD, user_id }), SECRET), { ok: false });
  }
});

test("a correctly signed non-JSON payload is rejected", () => {
  const encodedPayload = Buffer.from("not json").toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
  assert.deepEqual(verifyMetaSignedRequest(`${signature}.${encodedPayload}`, SECRET), { ok: false });
});

// The route handlers are not importable under plain Node (Next/Supabase), so
// pin the contract structurally: verify first, 401 on failure, no logging of
// the request, and the deletion confirmation shape Meta requires.
test("callback routes verify before acting and never log request content", async () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)
  for (const route of ["app/api/meta/deauthorize/route.ts", "app/api/meta/data-deletion/route.ts"]) {
    const source = read(route);
    assert.match(source, /verifyMetaSignedRequest/);
    assert.match(source, /META_APP_SECRET/);
    assert.match(source, /status: 401/);
    assert.ok(source.indexOf("verifyMetaSignedRequest(") < source.indexOf("createServiceSupabaseClient()"));
    assert.doesNotMatch(source, /console\.|logEvent\(/);
  }
  const deletion = read("app/api/meta/data-deletion/route.ts");
  assert.match(deletion, /confirmation_code/);
  assert.match(deletion, /DATA_DELETION_STATUS_URL/);
  const { DATA_DELETION_STATUS_URL } = await import(new URL("../lib/site-contact.ts", import.meta.url).href);
  assert.equal(DATA_DELETION_STATUS_URL, "https://aipilot.waveswebstudio.in/data-deletion/status");
});

test("deletion service scopes every write to the matched business and logs no content", () => {
  const source = readFileSync(new URL("../lib/instagram-data-deletion.ts", import.meta.url), "utf8");
  const writes = source.match(/\.from\("[a-z_]+"\)\s*\.(delete|update)\(/g) ?? [];
  assert.ok(writes.length >= 8);
  assert.doesNotMatch(source, /access_token["':]/);
  assert.doesNotMatch(source, /console\./);
});
