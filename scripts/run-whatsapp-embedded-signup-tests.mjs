// WhatsApp Embedded Signup + per-business templates (production readiness
// item 6, 2026-11-03). Every Graph call is MOCKED: no live Meta call.
//   1. Meta's postMessage parsing: origin check, FINISH / CANCEL / ERROR,
//      malformed and spoofed payloads.
//   2. Onboarding steps in order (exchange -> phone check -> subscribe ->
//      register), each failure path with its own code, the token kept after
//      a successful exchange for "Finish setup", the PIN shape.
//   3. Templates: create body, list parsing, status webhook parsing, labels.
//   4. Structural: server actions are admin + plan gated and Zod-checked; the
//      code exchange is server-side; secrets/tokens never reach the client;
//      the webhook and scheduler are wired; the migration's RLS posture.
//
// Run: npm run test:whatsapp-embedded-signup
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const es = await import(new URL("../lib/whatsapp-embedded-signup-rules.ts", import.meta.url).href);
const templates = await import(new URL("../lib/whatsapp-templates.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

// ------------------------------------------------------------ postMessage

test("only https *.facebook.com origins are accepted", () => {
  assert.equal(es.isMetaOrigin("https://www.facebook.com"), true);
  assert.equal(es.isMetaOrigin("https://web.facebook.com"), true);
  assert.equal(es.isMetaOrigin("https://facebook.com"), true);
  assert.equal(es.isMetaOrigin("http://www.facebook.com"), false);
  assert.equal(es.isMetaOrigin("https://evilfacebook.com"), false);
  assert.equal(es.isMetaOrigin("https://facebook.com.evil.io"), false);
  assert.equal(es.isMetaOrigin("not a url"), false);
});

test("FINISH / CANCEL / ERROR are parsed (string or object payloads)", () => {
  const finish = JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { phone_number_id: "1060", waba_id: "2070", business_id: "3080" } });
  assert.deepEqual(es.parseEmbeddedSignupEvent(finish), { kind: "finish", finishType: "FINISH", wabaId: "2070", phoneNumberId: "1060", businessId: "3080" });
  assert.deepEqual(es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_ONLY_WABA", data: { waba_id: "2070" } }), {
    kind: "finish",
    finishType: "FINISH_ONLY_WABA",
    wabaId: "2070",
    phoneNumberId: null,
    businessId: null,
  });
  assert.deepEqual(es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } }), {
    kind: "cancel",
    currentStep: "PHONE_NUMBER_SETUP",
  });
  const error = es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: { error_message: "boom", error_code: 524126, session_id: "s1" } });
  assert.deepEqual(error, { kind: "error", message: "boom", code: "524126", sessionId: "s1" });
});

test("malformed, foreign and injection-shaped payloads are ignored", () => {
  assert.equal(es.parseEmbeddedSignupEvent("not json"), null);
  assert.equal(es.parseEmbeddedSignupEvent({ type: "OTHER", event: "FINISH", data: { waba_id: "1" } }), null);
  assert.equal(es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: {} }), null, "no WABA id");
  assert.equal(
    es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "../../me/accounts" } }),
    null,
    "non-numeric ids never reach a Graph path",
  );
  const weirdPhone = es.parseEmbeddedSignupEvent({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1", phone_number_id: "1/register" } });
  assert.equal(weirdPhone.phoneNumberId, null);
});

// ------------------------------------------------------------ onboarding

function mockGraph(responses) {
  const calls = [];
  const graph = async (method, pathName, options = {}) => {
    calls.push({ method, path: pathName, options });
    const key = `${method} ${pathName}`;
    const response = responses[key];
    if (!response) throw new Error(`unexpected Graph call ${key}`);
    return typeof response === "function" ? response(options) : response;
  };
  return { graph, calls };
}

const INPUT = { appId: "app1", appSecret: "shh", code: "code-abc", wabaId: "2070", phoneNumberId: "1060", pin: "123456" };
const OK_FLOW = {
  "GET /oauth/access_token": { ok: true, data: { access_token: "EAABusinessToken", token_type: "bearer" } },
  "GET /2070/phone_numbers": { ok: true, data: { data: [{ id: "1060", display_phone_number: "+91 98765 43210", verified_name: "Waves Demo" }] } },
  "POST /2070/subscribed_apps": { ok: true, data: { success: true } },
  "POST /1060/register": { ok: true, data: { success: true } },
};

test("happy path: exchange -> phone check -> subscribe -> register, in that order, with the right inputs", async () => {
  const { graph, calls } = mockGraph(OK_FLOW);
  const result = await es.runEmbeddedSignupOnboarding(graph, INPUT);
  assert.deepEqual(result, { ok: true, token: "EAABusinessToken", phone: { id: "1060", displayPhoneNumber: "+91 98765 43210", verifiedName: "Waves Demo" } });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), Object.keys(OK_FLOW));
  assert.deepEqual(calls[0].options.query, { client_id: "app1", client_secret: "shh", code: "code-abc" });
  assert.equal(calls[0].options.token, undefined, "the exchange sends no bearer token");
  for (const call of calls.slice(1)) assert.equal(call.options.token, "EAABusinessToken");
  assert.deepEqual(calls[3].options.json, { messaging_product: "whatsapp", pin: "123456" });
});

test("exchange failure: stops, no token, nothing else called", async () => {
  const { graph, calls } = mockGraph({ "GET /oauth/access_token": { ok: false, status: 400, error: { code: 100, message: "code expired" } } });
  const result = await es.runEmbeddedSignupOnboarding(graph, INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.code, "exchange_failed");
  assert.equal(result.token, null);
  assert.equal(result.metaCode, 100);
  assert.equal(calls.length, 1);
  const noToken = await es.runEmbeddedSignupOnboarding(mockGraph({ "GET /oauth/access_token": { ok: true, data: {} } }).graph, INPUT);
  assert.equal(noToken.code, "exchange_failed", "a 200 without access_token is still a failure");
});

test("phone not in the WABA (or lookup error) stops before subscribing, but keeps the token", async () => {
  const wrongPhone = mockGraph({ ...OK_FLOW, "GET /2070/phone_numbers": { ok: true, data: { data: [{ id: "9999" }] } } });
  const result = await es.runEmbeddedSignupOnboarding(wrongPhone.graph, INPUT);
  assert.equal(result.code, "phone_not_in_waba");
  assert.equal(result.token, "EAABusinessToken");
  assert.equal(wrongPhone.calls.length, 2);
  const lookupError = await es.runEmbeddedSignupOnboarding(
    mockGraph({ ...OK_FLOW, "GET /2070/phone_numbers": { ok: false, status: 500, error: null } }).graph,
    INPUT,
  );
  assert.equal(lookupError.code, "phone_lookup_failed");
});

test("subscribe failure and each register failure have their own code", async () => {
  const subscribe = await es.runEmbeddedSignupOnboarding(
    mockGraph({ ...OK_FLOW, "POST /2070/subscribed_apps": { ok: false, status: 403, error: { code: 200, message: "perm" } } }).graph,
    INPUT,
  );
  assert.equal(subscribe.code, "subscribe_failed");
  assert.equal(subscribe.step, "subscribe");
  assert.equal(subscribe.phone.displayPhoneNumber, "+91 98765 43210");
  const cases = [
    [133016, "register_rate_limited"],
    [133005, "register_pin_mismatch"],
    [131000, "register_failed"],
  ];
  for (const [metaCode, expected] of cases) {
    const result = await es.runEmbeddedSignupOnboarding(
      mockGraph({ ...OK_FLOW, "POST /1060/register": { ok: false, status: 400, error: { code: metaCode, error_user_msg: "nope" } } }).graph,
      INPUT,
    );
    assert.equal(result.code, expected, String(metaCode));
    assert.equal(result.token, "EAABusinessToken");
    assert.equal(result.metaMessage, "nope");
  }
});

test("Finish setup retries without the code (stored token)", async () => {
  const { graph, calls } = mockGraph(OK_FLOW);
  const result = await es.finishEmbeddedSignupOnboarding(graph, { token: "stored", wabaId: "2070", phoneNumberId: "1060", pin: "000123" });
  assert.equal(result.ok, true);
  assert.equal(calls[0].path, "/2070/phone_numbers", "no exchange on retry");
});

test("registration PIN is always 6 digits; every failure has owner-facing copy", () => {
  assert.equal(es.generateRegistrationPin(() => 0), "000000");
  assert.equal(es.generateRegistrationPin(() => 0.999999), "999999");
  assert.match(es.generateRegistrationPin(), /^\d{6}$/);
  for (const code of ["exchange_failed", "phone_not_in_waba", "phone_lookup_failed", "subscribe_failed", "register_failed", "register_rate_limited", "register_pin_mismatch"]) {
    assert.ok(es.onboardingFailureMessage(code).length > 20, code);
  }
});

// ------------------------------------------------------------ templates

test("template create body: UTILITY, positional, example per {{n}}", () => {
  const definition = templates.WHATSAPP_TEMPLATES.appointment_reminder;
  const body = es.buildTemplateCreateBody({ name: "appointment_reminder", language: "en", body: definition.body, example: definition.example });
  assert.equal(body.category, "UTILITY");
  assert.equal(body.parameter_format, "POSITIONAL");
  assert.equal(body.components[0].type, "BODY");
  const placeholders = definition.body.match(/\{\{\d+\}\}/g);
  assert.equal(body.components[0].example.body_text[0].length, placeholders.length, "one example per placeholder");
  for (const kind of Object.keys(templates.WHATSAPP_TEMPLATES)) {
    const def = templates.WHATSAPP_TEMPLATES[kind];
    assert.match(def.suggestedName, /^[a-z0-9_]+$/);
    assert.equal((def.body.match(/\{\{\d+\}\}/g) ?? []).length, def.example.length, kind);
  }
});

test("template list parsing: statuses normalised, NONE reason dropped, junk skipped", () => {
  const list = es.parseTemplateList({
    data: [
      { id: "1", name: "appointment_confirmed", language: "en", status: "APPROVED", category: "UTILITY", rejected_reason: "NONE" },
      { id: "2", name: "appointment_declined", language: "en", status: "rejected", rejected_reason: "INVALID_FORMAT" },
      { name: "x", language: "en", status: "SOMETHING_NEW" },
      null,
    ],
  });
  assert.deepEqual(list.map((t) => [t.name, t.status, t.rejectedReason]), [
    ["appointment_confirmed", "APPROVED", null],
    ["appointment_declined", "REJECTED", "INVALID_FORMAT"],
  ]);
  assert.deepEqual(es.parseTemplateList({}), []);
});

test("message_template_status_update webhook parsing", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "2070",
        changes: [
          { field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 123, message_template_name: "appointment_reminder", message_template_language: "en", reason: "NONE" } },
          { field: "messages", value: {} },
        ],
      },
      { id: "not-numeric", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "x", message_template_language: "en" } }] },
    ],
  };
  assert.deepEqual(es.parseTemplateStatusUpdates(body), [
    { wabaId: "2070", templateId: "123", name: "appointment_reminder", language: "en", status: "APPROVED", reason: null },
  ]);
  assert.deepEqual(es.parseTemplateStatusUpdates({}), []);
});

test("status labels", () => {
  assert.deepEqual(es.describeTemplateStatus("APPROVED"), { label: "Approved", tone: "ok" });
  assert.equal(es.describeTemplateStatus("PENDING").tone, "wait");
  assert.equal(es.describeTemplateStatus("REJECTED").tone, "bad");
  assert.equal(es.describeTemplateStatus("NOT_SUBMITTED").tone, "none");
  assert.equal(es.describeTemplateStatus("PAUSED").label, "Paused");
});

// ------------------------------------------------------------ structural

test("server actions: admin + WhatsApp plan gate + Zod before any Meta call", () => {
  const actions = read("app/(dashboard)/dashboard/whatsapp/actions.ts");
  const helper = actions.slice(actions.indexOf("async function requireWhatsappAdmin("));
  assert.match(helper, /requireMinRole\(orgRole, "org:admin"\)/);
  assert.match(helper, /if \(!channelAllowed\(entitlement, "whatsapp"\)\)/);
  const complete = actions.slice(actions.indexOf("export async function completeWhatsappEmbeddedSignupAction("));
  assert.ok(complete.indexOf("requireWhatsappAdmin()") < complete.indexOf("embeddedSignupSchema.safeParse(input)"));
  assert.ok(complete.indexOf("embeddedSignupSchema.safeParse(input)") < complete.indexOf("completeEmbeddedSignup("));
  assert.match(actions, /wabaId: z\.string\(\)\.regex\(\/\^\\d\{1,32\}\$\/\)/);
  const submit = actions.slice(actions.indexOf("export async function submitWhatsappTemplatesAction("));
  assert.ok(submit.indexOf("requireWhatsappAdmin()") < submit.indexOf("submitWhatsappTemplates("));
});

test("the code exchange, tokens and PIN stay server-side and encrypted", () => {
  const button = read("app/(dashboard)/dashboard/whatsapp/embedded-signup-button.tsx");
  assert.doesNotMatch(button, /appSecret|APP_SECRET|access_token|oauth\/access_token/);
  assert.match(button, /response_type: "code",\s*override_default_response_type: true,\s*extras: \{ setup: \{\} \},/);
  assert.match(button, /if \(!isMetaOrigin\(event\.origin\)\) return;/);
  const server = read("lib/whatsapp-embedded-signup.ts");
  assert.match(server, /import "server-only";/);
  assert.match(server, /\.\.\.whatsappTokenColumns\(token\)/);
  assert.match(server, /registration_pin_encrypted: sealToken\(ids\.pin\)/);
  assert.match(server, /!hasTokenEncryptionKey\(\)/, "refuses to run without the encryption key");
  assert.doesNotMatch(server, /logEvent\([^)]*token[^)]*\)/i);
  const page = read("app/(dashboard)/dashboard/whatsapp/page.tsx");
  assert.doesNotMatch(page, /appSecret/);
});

test("webhook applies template status updates; scheduler syncs; migration RLS posture", () => {
  const webhook = read("app/api/webhooks/whatsapp/route.ts");
  assert.match(webhook, /const templateUpdates = parseTemplateStatusUpdates\(body\);/);
  assert.match(read("lib/scheduler/jobs.ts"), /name: "whatsapp_template_sync"[\s\S]*?run: syncAllWhatsappTemplateStatuses/);
  const sql = read("supabase/migrations/20261124000000_whatsapp_embedded_signup.sql");
  assert.match(sql, /alter table public\.whatsapp_template_statuses force row level security;/);
  assert.match(sql, /revoke all on public\.whatsapp_template_statuses from anon, authenticated;\s*grant select on public\.whatsapp_template_statuses to authenticated;/);
  assert.match(sql, /create policy "whatsapp_template_statuses_select_own_business"/);
  assert.match(sql, /add column registration_pin_encrypted text;/);
});
