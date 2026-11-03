// WhatsApp 24-hour window and template tests (production readiness item 4;
// LAUNCH_AUDIT.md §7, blocker B5).
//
//   1. BEHAVIOURAL (pure, no network): the window boundary; text vs template
//      vs blocked; the exact Cloud API payloads; Graph error classification
//      (131047, template errors, unreachable, throttling, 5xx, auth); which
//      errors are retried; template config from env; parameter sanitising;
//      status callbacks (forward-only, failed wins); the staff notice.
//   2. STRUCTURAL: the delivery path decides at send time, flags permanent
//      failures, retries only retryable errors, switches to the template on
//      131047; appointment notices carry their template; status callbacks
//      are recorded; every template is documented in config.
//
// Run: npm run test:whatsapp-window
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/whatsapp-rules.ts", import.meta.url).href);
const templates = await import(new URL("../lib/whatsapp-templates.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-03T12:00:00Z");
const TEMPLATE = { name: "appointment_confirmed", language: "en", params: ["Priya", "Waves", "Tue 4 Nov, 3:00 pm"] };

// ----------------------------------------------------------------- window

test("window: inside at 23h59m, closed at 24h01m, closed with no inbound message", () => {
  assert.equal(rules.isWithinWhatsappWindow(new Date(NOW.getTime() - 24 * HOUR + 60_000), NOW), true);
  assert.equal(rules.isWithinWhatsappWindow(new Date(NOW.getTime() - 24 * HOUR - 60_000), NOW), false);
  assert.equal(rules.isWithinWhatsappWindow(null, NOW), false);
});

test("decision: text inside the window; template outside; blocked with the right reason", () => {
  assert.deepEqual(rules.decideWhatsappSend({ withinWindow: true, templateKind: "appointment_confirmed", template: TEMPLATE }), { kind: "text" });
  assert.deepEqual(rules.decideWhatsappSend({ withinWindow: false, templateKind: "appointment_confirmed", template: TEMPLATE }), {
    kind: "template",
    template: TEMPLATE,
  });
  assert.deepEqual(rules.decideWhatsappSend({ withinWindow: false, templateKind: "appointment_confirmed", template: null }), {
    kind: "blocked",
    reason: "template_not_configured",
  });
  assert.deepEqual(rules.decideWhatsappSend({ withinWindow: false, templateKind: null, template: null }), {
    kind: "blocked",
    reason: "outside_24h_window",
  });
});

test("an appointment confirmed 3 days after the last message goes out as the template", () => {
  const lastInbound = new Date(NOW.getTime() - 72 * HOUR);
  const decision = rules.decideWhatsappSend({
    withinWindow: rules.isWithinWhatsappWindow(lastInbound, NOW),
    templateKind: "appointment_confirmed",
    template: TEMPLATE,
  });
  assert.equal(decision.kind, "template");
  const payload = rules.buildWhatsappPayload("919876543210", decision);
  assert.equal(payload.type, "template");
});

test("payloads match the Cloud API shapes", () => {
  assert.deepEqual(rules.buildWhatsappPayload("91", { kind: "text", text: "hi" }), {
    messaging_product: "whatsapp",
    to: "91",
    type: "text",
    text: { body: "hi" },
  });
  assert.deepEqual(rules.buildWhatsappPayload("91", { kind: "template", template: TEMPLATE }), {
    messaging_product: "whatsapp",
    to: "91",
    type: "template",
    template: {
      name: "appointment_confirmed",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Priya" },
            { type: "text", text: "Waves" },
            { type: "text", text: "Tue 4 Nov, 3:00 pm" },
          ],
        },
      ],
    },
  });
});

// --------------------------------------------------------------- errors

test("Graph errors are classified; only throttling and transient ones are retried", () => {
  const cases = [
    [400, 131047, "outside_window", false],
    [404, 132001, "template_error", false],
    [400, 132015, "template_error", false],
    [400, 132000, "template_error", false],
    [400, 131026, "recipient_unreachable", false],
    [429, 130429, "rate_limited", true],
    [400, 131056, "rate_limited", true],
    [500, 131000, "transient", true],
    [503, null, "transient", true],
    [0, null, "transient", true],
    [401, 190, "auth", false],
    [403, null, "auth", false],
    [429, null, "rate_limited", true],
    [400, 100, "permanent", false],
  ];
  for (const [status, code, expected, retryable] of cases) {
    const got = rules.classifyWhatsappSendError(status, { code, subcode: null });
    assert.equal(got, expected, `${status}/${code}`);
    assert.equal(rules.isRetryableWhatsappError(got), retryable, `${status}/${code} retryable`);
  }
});

test("readWhatsappGraphError never trusts the shape and never returns message text", () => {
  assert.deepEqual(rules.readWhatsappGraphError({ error: { code: 131047, error_subcode: 2494010, message: "secret text" } }), {
    code: 131047,
    subcode: 2494010,
  });
  assert.deepEqual(rules.readWhatsappGraphError(null), { code: null, subcode: null });
  assert.deepEqual(rules.readWhatsappGraphError({ error: "nope" }), { code: null, subcode: null });
  assert.deepEqual(rules.readWhatsappGraphError({ error: { code: "131047" } }), { code: null, subcode: null });
});

// ------------------------------------------------------------ templates

test("a template is used only once its env var is set (approved)", () => {
  assert.equal(templates.resolveWhatsappTemplate("appointment_confirmed", {}), null);
  assert.equal(templates.resolveWhatsappTemplate("appointment_confirmed", { WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMED: "  " }), null);
  assert.deepEqual(
    templates.resolveWhatsappTemplate("appointment_confirmed", { WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMED: "appt_ok_v2" }),
    { kind: "appointment_confirmed", name: "appt_ok_v2", language: "en" },
  );
  assert.equal(
    templates.resolveWhatsappTemplate("appointment_reminder", {
      WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER: "appointment_reminder",
      WHATSAPP_TEMPLATE_LANGUAGE: "en_US",
    }).language,
    "en_US",
  );
});

test("template parameters are single-line, non-empty and short", () => {
  assert.deepEqual(templates.appointmentTemplateParams({ contactName: null, businessName: "Waves", slotLabel: "Tue" }), ["there", "Waves", "Tue"]);
  assert.deepEqual(
    templates.appointmentTemplateParams({ contactName: "  Priya   Sharma ", businessName: "A\nB\tC", slotLabel: "" }),
    ["Priya", "A B C", "your requested time"],
  );
  assert.equal(templates.sanitizeTemplateParam("x".repeat(500), "f").length, 200);
  assert.doesNotMatch(templates.sanitizeTemplateParam("a      b", "f"), / {4,}/);
});

test("every template: suggested name is valid, body placeholders match its parameters, env var is documented", () => {
  const envSchema = read("lib/env.ts");
  const example = read(".env.example");
  for (const [kind, def] of Object.entries(templates.WHATSAPP_TEMPLATES)) {
    assert.match(def.suggestedName, /^[a-z0-9_]+$/, kind);
    const placeholders = [...def.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(placeholders, def.parameters.map((_, i) => i + 1), `${kind}: {{1}}..{{n}} in order`);
    assert.equal(def.example.length, def.parameters.length, `${kind}: one example per parameter`);
    assert.equal(def.category, "UTILITY");
    assert.match(envSchema, new RegExp(`${def.envVar}: z\\.`), `${def.envVar} validated`);
    assert.match(example, new RegExp(`^${def.envVar}=`, "m"), `${def.envVar} documented`);
  }
});

// ------------------------------------------------------- status callbacks

test("status callbacks are validated", () => {
  const updates = rules.extractWhatsappStatuses([
    { id: "wamid.1", status: "delivered", timestamp: "1730635200" },
    { id: "wamid.2", status: "failed", timestamp: "1730635200", errors: [{ code: 131047, title: "Re-engagement message" }] },
    { id: "wamid.3", status: "deleted" },
    { status: "read" },
    "junk",
  ]);
  assert.deepEqual(updates, [
    { waMessageId: "wamid.1", status: "delivered", timestampMs: 1730635200000, errorCode: null },
    { waMessageId: "wamid.2", status: "failed", timestampMs: 1730635200000, errorCode: 131047 },
  ]);
  assert.deepEqual(rules.extractWhatsappStatuses(undefined), []);
});

test("statuses only move forward; failed always wins and is final", () => {
  assert.equal(rules.shouldApplyStatus(null, "sent"), true);
  assert.equal(rules.shouldApplyStatus("sent", "delivered"), true);
  assert.equal(rules.shouldApplyStatus("read", "delivered"), false, "a late 'delivered' never overwrites 'read'");
  assert.equal(rules.shouldApplyStatus("read", "failed"), true);
  assert.equal(rules.shouldApplyStatus("failed", "read"), false);
  assert.equal(rules.shouldApplyStatus("failed", "failed"), false);
});

test("staff reply notices", () => {
  assert.equal(rules.whatsappStaffReplyNotice(undefined), undefined);
  assert.equal(rules.whatsappStaffReplyNotice("retry_scheduled"), undefined);
  assert.match(rules.whatsappStaffReplyNotice("outside_24h_window"), /24 hours/);
  assert.match(rules.whatsappStaffReplyNotice("auth"), /Reconnect/);
  assert.match(rules.whatsappStaffReplyNotice("template_rejected"), /flagged/);
});

// ------------------------------------------------------------ structural

test("delivery decides at send time from the last inbound message", () => {
  const source = read("lib/whatsapp-delivery.ts");
  assert.match(source, /decideWhatsappSend\(\{\s*withinWindow: isWithinWhatsappWindow\(lastInbound, new Date\(\)\),/);
  assert.match(source, /if \(decision\.kind === "blocked"\) \{\s*await failPermanently\(supabase, outbound, decision\.reason\);/);
});

test("delivery retries only retryable errors and flags every permanent failure", () => {
  const source = read("lib/whatsapp-delivery.ts");
  assert.match(source, /if \(!isRetryableWhatsappError\(outcome\.errorClass\)\) \{[\s\S]*?await failPermanently\(/);
  const fail = source.slice(source.indexOf("async function failPermanently("), source.indexOf("type GraphSendOutcome"));
  assert.match(fail, /flagConversationNeedsAttention\(/);
  assert.match(fail, /"whatsapp_send_blocked"[\s\S]*?"error"/);
});

test("on 131047 a text send switches to the template once", () => {
  const source = read("lib/whatsapp-delivery.ts");
  assert.match(source, /outcome\.errorClass === "outside_window" && sentAs === "text" && template/);
});

test("appointment notices carry their approved template; status callbacks are recorded", () => {
  const notices = read("lib/appointment-notifications.ts");
  assert.match(notices, /templateFallback: \{\s*kind: notice\.templateKind,\s*template: resolveWhatsappTemplate\(notice\.templateKind, process\.env\)/);
  assert.match(notices, /confirmed: "appointment_confirmed"/);
  const webhook = read("app/api/webhooks/whatsapp/route.ts");
  assert.match(webhook, /await recordWhatsappStatuses\(supabase, phoneNumberId, statuses\)/);
  const status = read("lib/whatsapp-status.ts");
  assert.match(status, /\.eq\("business_id", businessId\)\s*\.eq\("wa_message_id", update\.waMessageId\)/, "lookup scoped to the business");
});

test("staff replies show the WhatsApp notice", () => {
  assert.match(read("app/(dashboard)/dashboard/conversations/actions.ts"), /notice = whatsappStaffReplyNotice\(sent\.reason\);/);
});

test("migration adds template + delivery-status columns without new tables or grants", () => {
  const sql = read("supabase/migrations/20261117000000_whatsapp_window_and_templates.sql");
  for (const column of ["template_kind", "template_name", "template_language", "template_params", "sent_as", "failure_reason", "delivery_status"]) {
    assert.match(sql, new RegExp(`add column ${column} `));
  }
  assert.doesNotMatch(sql, /^\s*(create table|grant)\b/im, "statements only, not comments");
  assert.match("  grant select on x to y;", /^\s*(create table|grant)\b/im, "the check itself can fail");
});
