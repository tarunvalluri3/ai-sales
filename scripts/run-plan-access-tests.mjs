// Plan access and trials (production readiness item 1, 2026-11-03).
//   1. BEHAVIOURAL (pure, lib/entitlement-rules.ts + lib/plans.ts):
//      - trial: no card, all three channels, configurable hard reply cap, ends
//        on time; a trial-already-used row grants nothing;
//      - plans: WhatsApp and Instagram on Growth/Scale only;
//      - no subscription row = no paid access;
//      - read failure: last known plan for up to N hours, RE-EVALUATED now,
//        then no paid access; disabled with 0;
//      - every channel gate also needs `serving`.
//   2. STRUCTURAL: the server gates (WhatsApp webhook before any write, the
//      send queue, connect action), the trial fail-closed quota, the
//      trial_grants migration, the checkout placeholder, the UI copy sources.
//
// Run: npm run test:plan-access
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/entitlement-rules.ts", import.meta.url).href);
const plans = await import(new URL("../lib/plans.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const NOW = new Date("2026-11-10T12:00:00Z");
const CONFIG = { trialReplyQuota: 200 };

function row(overrides = {}) {
  return {
    plan_key: "starter",
    status: "trialing",
    trial_started_at: "2026-11-05T00:00:00Z",
    trial_ends_at: "2026-11-19T00:00:00Z",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    razorpay_subscription_id: null,
    billing_interval: null,
    scheduled_plan_key: null,
    past_due_since: null,
    razorpay_order_id: null,
    reply_quota_override: null,
    ...overrides,
  };
}

const paidRow = (planKey, extra = {}) =>
  row({
    plan_key: planKey,
    status: "active",
    trial_started_at: null,
    trial_ends_at: null,
    current_period_start: "2026-11-01T00:00:00Z",
    current_period_end: "2026-12-01T00:00:00Z",
    razorpay_subscription_id: "sub_1",
    ...extra,
  });

// ------------------------------------------------------------ plans

test("plans: WhatsApp and Instagram on Growth and Scale only; the trial includes every channel", () => {
  assert.deepEqual(plans.PLANS.starter.channels, { website: true, whatsapp: false, instagram: false });
  assert.deepEqual(plans.PLANS.growth.channels, { website: true, whatsapp: true, instagram: true });
  assert.deepEqual(plans.PLANS.scale.channels, { website: true, whatsapp: true, instagram: true });
  assert.deepEqual(plans.TRIAL_CHANNELS, { website: true, whatsapp: true, instagram: true });
  assert.equal(plans.TRIAL_DAYS, 14);
  assert.equal(plans.TRIAL_REPLY_QUOTA, 200, "default trial cap");
  assert.equal(plans.PLANS.starter.monthlyPricePaise, 149_900, "prices unchanged (GST-inclusive)");
});

// ------------------------------------------------------------ trial

test("trial: no card needed, all channels, configured cap, serving until it ends", () => {
  const ent = rules.entitlementFromRow(row(), NOW, CONFIG);
  assert.equal(ent.isTrial, true);
  assert.equal(ent.serving, true);
  assert.equal(ent.hasPaymentMethod, false, "serving without a card");
  assert.equal(ent.replyQuota, 200);
  assert.deepEqual(ent.channels, { website: true, whatsapp: true, instagram: true });
  for (const channel of ["website", "whatsapp", "instagram"]) assert.equal(rules.channelAllowed(ent, channel), true, channel);
  assert.equal(rules.entitlementFromRow(row(), NOW, { trialReplyQuota: 50 }).replyQuota, 50, "configurable cap");
  assert.equal(rules.entitlementFromRow(row({ reply_quota_override: 999 }), NOW, CONFIG).replyQuota, 999, "admin override still wins");
});

test("trial: ended -> not serving and every channel closed", () => {
  const ent = rules.entitlementFromRow(row(), new Date("2026-11-19T00:00:01Z"), CONFIG);
  assert.equal(ent.serving, false);
  assert.equal(ent.notServingReason, "trial_expired");
  for (const channel of ["website", "whatsapp", "instagram"]) assert.equal(rules.channelAllowed(ent, channel), false, channel);
});

test("trial already used by the organisation (expired, no trial dates, no payment) grants nothing", () => {
  const ent = rules.entitlementFromRow(
    row({ status: "expired", trial_started_at: null, trial_ends_at: null, current_period_start: "2026-11-10T00:00:00Z", current_period_end: "2026-11-10T00:00:01Z" }),
    NOW,
    CONFIG,
  );
  assert.equal(ent.serving, false);
  assert.equal(ent.notServingReason, "trial_already_used");
  assert.equal(rules.channelAllowed(ent, "whatsapp"), false);
  assert.equal(rules.channelAllowed(ent, "website"), false, "website gate also needs serving");
  const paidThenExpired = rules.entitlementFromRow(paidRow("growth", { status: "expired" }), NOW, CONFIG);
  assert.equal(paidThenExpired.notServingReason, "subscription_expired", "a lapsed paid plan is not 'trial used'");
});

// ------------------------------------------------------------ paid

test("paid plans: Starter has no Meta channels, Growth has both; past_due keeps serving through grace", () => {
  const starter = rules.entitlementFromRow(paidRow("starter"), NOW, CONFIG);
  assert.equal(rules.channelAllowed(starter, "website"), true);
  assert.equal(rules.channelAllowed(starter, "whatsapp"), false);
  assert.equal(rules.channelAllowed(starter, "instagram"), false);
  assert.equal(starter.replyQuota, 1000);
  const growth = rules.entitlementFromRow(paidRow("growth"), NOW, CONFIG);
  assert.equal(rules.channelAllowed(growth, "whatsapp"), true);
  assert.equal(rules.channelAllowed(growth, "instagram"), true);
  const pastDue = rules.entitlementFromRow(paidRow("growth", { status: "past_due", past_due_since: "2026-11-08T00:00:00Z" }), NOW, CONFIG);
  assert.equal(pastDue.serving, true);
  const lapsed = rules.entitlementFromRow(paidRow("growth", { status: "past_due", past_due_since: "2026-10-01T00:00:00Z", current_period_end: "2026-10-05T00:00:00Z" }), NOW, CONFIG);
  assert.equal(lapsed.serving, false);
  assert.equal(rules.channelAllowed(lapsed, "whatsapp"), false, "a lapsed Growth plan closes WhatsApp too");
});

// ------------------------------------------------------------ no row / read failure

test("no subscription row = no paid access (it used to be free Scale)", () => {
  const ent = rules.noPaidAccessEntitlement(NOW, "no_subscription");
  assert.equal(ent.serving, false);
  assert.equal(ent.noSubscription, true);
  assert.equal(ent.replyQuota, 0);
  assert.equal(ent.planKey, "starter");
  assert.equal(rules.channelAllowed(ent, "whatsapp"), false);
  assert.equal(rules.channelAllowed(ent, "instagram"), false);
});

test("read failure: last known plan within the window, re-evaluated NOW; then no paid access", () => {
  const store = new rules.LastKnownEntitlementStore();
  const maxAge = 24 * 60 * 60 * 1000;
  store.remember("biz", paidRow("growth"), NOW.getTime());

  const soon = rules.entitlementOnReadFailure(store, "biz", new Date(NOW.getTime() + 60 * 60 * 1000), maxAge, CONFIG);
  assert.equal(soon.outcome.kind, "last_known");
  assert.equal(soon.entitlement.serving, true);
  assert.equal(soon.entitlement.fromLastKnown, true);
  assert.equal(rules.channelAllowed(soon.entitlement, "whatsapp"), true);

  const late = rules.entitlementOnReadFailure(store, "biz", new Date(NOW.getTime() + maxAge + 1), maxAge, CONFIG);
  assert.deepEqual(late.outcome, { kind: "none", reason: "too_old" });
  assert.equal(late.entitlement.serving, false);
  assert.equal(late.entitlement.notServingReason, "subscription_unavailable");

  const never = rules.entitlementOnReadFailure(store, "other", NOW, maxAge, CONFIG);
  assert.deepEqual(never.outcome, { kind: "none", reason: "never_seen" });
  assert.equal(never.entitlement.serving, false, "no last known plan -> no paid access");

  const disabled = rules.entitlementOnReadFailure(store, "biz", NOW, 0, CONFIG);
  assert.deepEqual(disabled.outcome, { kind: "none", reason: "disabled" });
});

test("read failure: a trial that ENDS during the outage still ends (the row is re-evaluated)", () => {
  const store = new rules.LastKnownEntitlementStore();
  store.remember("biz", row({ trial_ends_at: "2026-11-10T13:00:00Z" }), NOW.getTime());
  const after = rules.entitlementOnReadFailure(store, "biz", new Date("2026-11-10T14:00:00Z"), 24 * 3_600_000, CONFIG);
  assert.equal(after.outcome.kind, "last_known");
  assert.equal(after.entitlement.serving, false);
  assert.equal(after.entitlement.notServingReason, "trial_expired");
});

test("last-known store: forget on a confirmed missing row; bounded size", () => {
  const store = new rules.LastKnownEntitlementStore(2);
  store.remember("a", paidRow("growth"), 0);
  store.forget("a");
  assert.equal(store.lookup("a", 1, 1000).kind, "none");
  store.remember("x", paidRow("growth"), 0);
  store.remember("y", paidRow("growth"), 0);
  store.remember("z", paidRow("growth"), 0);
  assert.equal(store.lookup("x", 1, 1000).kind, "none", "oldest evicted");
  assert.equal(store.lookup("z", 1, 1000).kind, "last_known");
});

test("config parsing: defaults, bounds, junk", () => {
  assert.equal(rules.parseTrialReplyQuota(undefined), 200);
  assert.equal(rules.parseTrialReplyQuota("500"), 500);
  assert.equal(rules.parseTrialReplyQuota("0"), 200);
  assert.equal(rules.parseTrialReplyQuota("1e3"), 200);
  assert.equal(rules.parseTrialReplyQuota("200000"), 200);
  assert.equal(rules.parseLastKnownMaxHours(undefined), 24);
  assert.equal(rules.parseLastKnownMaxHours("0"), 0);
  assert.equal(rules.parseLastKnownMaxHours("1.5"), 1.5);
  assert.equal(rules.parseLastKnownMaxHours("200"), 24);
  assert.equal(rules.parseLastKnownMaxHours("-1"), 24);
  assert.equal(rules.lastKnownMaxAgeMsFromEnv({ SUBSCRIPTION_LAST_KNOWN_MAX_HOURS: "2" }), 2 * 3_600_000);
});

// ------------------------------------------------------------ structural

test("subscription.ts: no free-Scale fallback; read failures alert; channel gates use channelAllowed", () => {
  const source = read("lib/subscription.ts");
  assert.doesNotMatch(source, /grandfathered|GRANDFATHERED/);
  assert.match(source, /if \(!data\) \{\s*lastKnown\.forget\(businessId\);\s*return noPaidAccessEntitlement\(now, "no_subscription"\);/);
  assert.match(source, /if \(error\) return degradedEntitlement\(businessId, now, "read_error"\);/);
  assert.match(source, /event: "subscription_read_degraded"/);
  assert.match(source, /return channelAllowed\(entitlement, channel\);/);
});

test("trial usage limit is hard: an uncountable trial turn is refused; paid stays fail-open", () => {
  assert.match(read("lib/usage-limit.ts"), /allowed: entitlement\.serving && !entitlement\.isTrial,/);
});

test("WhatsApp is gated on the server: webhook before any write, every send, the connect action", () => {
  const webhook = read("app/api/webhooks/whatsapp/route.ts");
  const ingest = webhook.slice(webhook.indexOf("async function ingestInboundMessage("));
  assert.ok(ingest.indexOf("isWhatsappAllowed(supabase, businessId)") > 0);
  assert.ok(ingest.indexOf("if (!whatsappAllowed)") < ingest.indexOf('.from("whatsapp_inbound_messages")'), "before the dedup write");
  const delivery = read("lib/whatsapp-delivery.ts");
  const deliver = delivery.slice(delivery.indexOf("async function deliverWhatsappOutboundRow("));
  assert.ok(deliver.indexOf('failPermanently(supabase, outbound, "whatsapp_not_allowed")') < deliver.indexOf("postToGraph("));
  assert.match(read("app/(dashboard)/dashboard/whatsapp/actions.ts"), /if \(!channelAllowed\(entitlement, "whatsapp"\)\)/);
  assert.match(read("app/api/meta/instagram/connect/route.ts"), /if \(!channelAllowed\(entitlement, "instagram"\)\)/);
});

test("trial_grants migration: survives deletion, service-role only, one trial per org", () => {
  const sql = read("supabase/migrations/20261121000000_trial_once_per_org.sql");
  const table = sql.slice(sql.indexOf("create table public.trial_grants"), sql.indexOf(");", sql.indexOf("create table public.trial_grants")));
  assert.doesNotMatch(table, /references/);
  assert.match(sql, /alter table public\.trial_grants force row level security;/);
  assert.match(sql, /revoke all on public\.trial_grants from anon, authenticated;/);
  assert.match(sql, /create policy trial_grants_no_client_access[\s\S]*?as restrictive[\s\S]*?using \(false\)/);
  assert.match(sql, /on conflict \(clerk_org_id\) do nothing;\s*get diagnostics granted = row_count;\s*if granted = 1 then/);
  assert.match(sql, /'starter', 'expired', now\(\), now\(\) \+ interval '1 second'/);
  assert.match(sql, /interval '14 days'/, "matches TRIAL_DAYS");
});

test("checkout without a row creates a non-serving placeholder, never free Scale", () => {
  const checkout = read("lib/billing-checkout.ts");
  const fn = checkout.slice(checkout.indexOf("async function ensureSubscriptionRow("), checkout.indexOf("function firstChargeAtFor("));
  assert.match(fn, /plan_key: "starter",\s*status: "expired",/);
  assert.doesNotMatch(fn, /plan_key: "scale"/);
});

test("UI: onboarding Continue needs the server's serving verdict; pricing shows the configured trial", () => {
  const step = read("app/(dashboard)/onboarding/_components/steps/plan-step.tsx");
  assert.match(step, /disabled=\{isPending \|\| confirming \|\| !valid\}/);
  assert.match(step, /Your free trial is on -- no card needed/);
  assert.match(read("lib/onboarding-steps.ts"), /plan: entitlement\.serving,/);
  const pricing = read("app/(dashboard)/pricing/page.tsx");
  assert.match(pricing, /const \{ trialReplyQuota \} = entitlementConfigFromEnv\(\);/);
  assert.doesNotMatch(pricing, /not included in any plan above/);
});
