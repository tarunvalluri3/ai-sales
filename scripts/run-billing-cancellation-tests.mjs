// Billing cancellation on business delete (production readiness item 6;
// LAUNCH_AUDIT.md §9, blocker B7).
//
//   1. BEHAVIOURAL (pure, no network):
//      - which deletions need a Razorpay cancellation;
//      - retry/backoff/alert policy (alert on first failure and on give-up);
//      - processRazorpayEvent for a DELETED business, driven against an
//        in-memory store: a charge after deletion is handled (not "unresolved"),
//        never touches a subscription row, and passes the payment through;
//        a cancellation confirms; unrelated subscriptions stay "unresolved";
//        the handler is optional so existing callers are unaffected.
//   2. STRUCTURAL: the record is written and attempted BEFORE the business is
//      deleted, cancellation is immediate (cycle end = false), the job is
//      scheduled, the webhook deps are wired, the table's RLS posture, and
//      that free-trial/card rules were not touched.
//
// Run: npm run test:billing-cancellation
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./alias-resolver-hooks.mjs", import.meta.url);

const rules = await import(new URL("../lib/billing-cancellation-rules.ts", import.meta.url).href);
const { processRazorpayEvent } = await import(new URL("../lib/razorpay-webhook.ts", import.meta.url).href);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n"); // line-ending agnostic (CRLF checkouts)

const DELETED_SUB = "sub_deleted_business";

// ----------------------------------------------------------------- rules

test("which deletions need a cancellation", () => {
  assert.equal(rules.needsCancellationOnDelete(null), false, "no subscriptions row");
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: null, status: "trialing" }), false, "trial without checkout");
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: null, status: "active" }), false, "annual plan = one-time order");
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: "sub_1", status: "active" }), true);
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: "sub_1", status: "past_due" }), true);
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: "sub_1", status: "trialing" }), true);
  assert.equal(
    rules.needsCancellationOnDelete({ razorpay_subscription_id: "sub_1", status: "cancelled" }),
    true,
    "'cancelled' locally can mean cancel-at-period-end with the mandate still live",
  );
  assert.equal(rules.needsCancellationOnDelete({ razorpay_subscription_id: "sub_1", status: "expired" }), false);
});

test("Razorpay terminal statuses", () => {
  for (const status of ["cancelled", "completed", "expired"]) assert.equal(rules.isTerminalRazorpayStatus(status), true);
  for (const status of ["active", "authenticated", "pending", "halted", null, undefined]) assert.equal(rules.isTerminalRazorpayStatus(status), false);
});

test("retry policy: alert on the first failure, back off, give up (and alert) after 10", () => {
  assert.deepEqual(rules.nextCancellationState(0, true), { status: "cancelled" });
  assert.deepEqual(rules.nextCancellationState(0, false), { status: "pending", nextAttemptInSeconds: 60, alert: true });
  assert.deepEqual(rules.nextCancellationState(1, false), { status: "pending", nextAttemptInSeconds: 120, alert: false });
  assert.equal(rules.nextCancellationState(7, false).nextAttemptInSeconds, 60 * 2 ** 7);
  assert.equal(rules.cancellationBackoffSeconds(20), 6 * 60 * 60, "each wait is capped at 6 h");
  let totalSeconds = 0;
  for (let attempts = 0; attempts < rules.MAX_CANCELLATION_ATTEMPTS - 1; attempts++) {
    totalSeconds += rules.nextCancellationState(attempts, false).nextAttemptInSeconds;
  }
  assert.equal(totalSeconds, 60 * 511, "about 8.5 hours of retries before giving up");
  assert.deepEqual(rules.nextCancellationState(rules.MAX_CANCELLATION_ATTEMPTS - 1, false), { status: "failed", alert: true });
  assert.deepEqual(rules.nextCancellationState(5, true), { status: "cancelled" }, "a late success still counts");
});

test("events for a deleted business", () => {
  assert.equal(rules.classifyDeletedBusinessEvent("subscription.charged"), "charge_after_deletion");
  assert.equal(rules.classifyDeletedBusinessEvent("subscription.cancelled"), "confirm_cancelled");
  assert.equal(rules.classifyDeletedBusinessEvent("subscription.completed"), "confirm_cancelled");
  assert.equal(rules.classifyDeletedBusinessEvent("subscription.halted"), "acknowledge");
});

// ------------------------------------------------- webhook after deletion

function deletedBusinessDeps({ withHandler = true } = {}) {
  const state = { updates: [], handled: [], logs: [], claimed: new Set(), invoices: [] };
  const deps = {
    async claimEvent(eventId) {
      if (state.claimed.has(eventId)) return false;
      state.claimed.add(eventId);
      return true;
    },
    async releaseEvent(eventId) {
      state.claimed.delete(eventId);
    },
    // The business and its subscriptions row are gone.
    async findSubscriptionByRazorpayId() {
      return null;
    },
    async findSubscriptionByBusinessId() {
      return null;
    },
    async updateSubscription(businessId, patch) {
      state.updates.push({ businessId, patch });
    },
    async sendNotice() {},
    async recordAudit() {},
    async issueInvoice(payment) {
      state.invoices.push(payment);
      return { status: "skipped", reason: "stubbed" };
    },
    async issueCreditNote() {
      return { status: "no_invoice" };
    },
    log(event, businessId, metadata, level) {
      state.logs.push({ event, level });
    },
  };
  if (withHandler) {
    deps.handleDeletedBusinessEvent = async (subscriptionId, event, payment) => {
      if (subscriptionId !== DELETED_SUB) return false;
      state.handled.push({ subscriptionId, event, payment });
      return true;
    };
  }
  return { deps, state };
}

function subscriptionEvent(event, subscriptionId = DELETED_SUB, payment = { id: "pay_after_delete", amount: 399900, status: "captured" }) {
  return {
    event,
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          status: "active",
          current_start: 1764547200,
          current_end: 1767225600,
          paid_count: 3,
          notes: { business_id: "00000000-0000-0000-0000-0000000000dd" },
        },
      },
      ...(event === "subscription.charged" ? { payment: { entity: payment } } : {}),
    },
  };
}

test("a charge for a deleted business is handled (alert path), never applied to a subscription", async () => {
  const { deps, state } = deletedBusinessDeps();
  const outcome = await processRazorpayEvent(deps, subscriptionEvent("subscription.charged"), "evt_charge_after_delete");
  assert.equal(outcome, "deleted_business");
  assert.deepEqual(state.handled, [
    { subscriptionId: DELETED_SUB, event: "subscription.charged", payment: { id: "pay_after_delete", amountPaise: 399900 } },
  ]);
  assert.equal(state.updates.length, 0, "no subscription row is written");
  assert.equal(state.invoices.length, 0, "no invoice is issued to a deleted business");
});

test("a replayed charge for a deleted business is a duplicate (alerted once)", async () => {
  const { deps, state } = deletedBusinessDeps();
  await processRazorpayEvent(deps, subscriptionEvent("subscription.charged"), "evt_x");
  const second = await processRazorpayEvent(deps, subscriptionEvent("subscription.charged"), "evt_x");
  assert.equal(second, "duplicate");
  assert.equal(state.handled.length, 1);
});

test("subscription.cancelled for a deleted business is handled", async () => {
  const { deps, state } = deletedBusinessDeps();
  assert.equal(await processRazorpayEvent(deps, subscriptionEvent("subscription.cancelled"), "evt_c"), "deleted_business");
  assert.equal(state.handled[0].event, "subscription.cancelled");
});

test("a subscription no business ever had is still 'unresolved' (logged at error level)", async () => {
  const { deps, state } = deletedBusinessDeps();
  const outcome = await processRazorpayEvent(deps, subscriptionEvent("subscription.charged", "sub_unknown"), "evt_u");
  assert.equal(outcome, "unresolved");
  assert.ok(state.logs.some((log) => log.event === "razorpay_webhook_unresolved_subscription" && log.level === "error"));
});

test("the handler is optional: without it, behaviour is exactly as before", async () => {
  const { deps } = deletedBusinessDeps({ withHandler: false });
  assert.equal(await processRazorpayEvent(deps, subscriptionEvent("subscription.charged"), "evt_n"), "unresolved");
});

// ------------------------------------------------------------ structural

test("the cancellation is recorded and attempted BEFORE the business is deleted", () => {
  const source = read("lib/business.ts");
  const fn = source.slice(source.indexOf("export async function deleteBusinessForOrg("));
  const record = fn.indexOf("await recordCancellationForDeletion(orgId);");
  const del = fn.indexOf(".delete()");
  assert.ok(record > 0 && del > record, "record first, then delete");
});

test("cancellation is immediate, a failed cancel re-checks Razorpay, and alerts are error-level", () => {
  const source = read("lib/billing-cancellation.ts");
  assert.match(source, /cancelSubscription\(row\.razorpay_subscription_id, false, row\.business_id\)/);
  assert.match(source, /fetchSubscription\(row\.razorpay_subscription_id\)/);
  assert.match(source, /"billing_cancellation_gave_up" : "billing_cancellation_failed"/);
  assert.match(source, /"billing_charge_after_deletion",[\s\S]*?"error"/);
  // A record that can't be written refuses the deletion.
  assert.match(source, /if \(writeError \|\| !row\) \{\s*throw new AppError\(/);
});

test("the retry job is scheduled and the webhook handler is wired", () => {
  assert.match(read("lib/scheduler/jobs.ts"), /name: "billing_cancellations", schedule: \{ kind: "every", seconds: 15 \* MINUTE \}[\s\S]*?run: processPendingBillingCancellations/);
  assert.match(read("lib/billing-store.ts"), /handleDeletedBusinessEvent: \(razorpaySubscriptionId, event, payment\) =>\s*handleDeletedBusinessEvent\(supabase, razorpaySubscriptionId, event, payment\)/);
});

test("migration: no FK to businesses (survives the cascade), RLS forced + deny policy, no client grants", () => {
  const sql = read("supabase/migrations/20261119000000_billing_cancellations.sql");
  const table = sql.slice(sql.indexOf("create table public.billing_cancellations"), sql.indexOf(");", sql.indexOf("create table public.billing_cancellations")));
  assert.doesNotMatch(table, /references public\.businesses/);
  assert.match(table, /razorpay_subscription_id text not null unique/);
  assert.match(sql, /alter table public\.billing_cancellations enable row level security;/);
  assert.match(sql, /alter table public\.billing_cancellations force row level security;/);
  assert.match(sql, /revoke all on public\.billing_cancellations from anon, authenticated;/);
  assert.match(sql, /create policy billing_cancellations_no_client_access[\s\S]*?as restrictive[\s\S]*?using \(false\)/);
});

test("free-trial and card requirements were not changed (a product decision for the owner)", () => {
  // The onboarding billing step still keys on entitlement.serving and the
  // trial trigger is untouched (LAUNCH_AUDIT.md §4).
  assert.match(read("lib/onboarding-steps.ts"), /serving/);
  for (const file of ["lib/billing-cancellation.ts", "lib/billing-cancellation-rules.ts"]) {
    assert.doesNotMatch(read(file), /trial_ends_at|hasPaymentMethod|payment_method/);
  }
});

test("the privacy policy names Razorpay as a payment processor (production readiness item 8)", () => {
  const privacy = read("app/(dashboard)/privacy/page.tsx");
  const processors = privacy.slice(privacy.indexOf('title="Who processes data on our behalf"'), privacy.indexOf('title="Instagram and other Meta platforms"'));
  assert.match(processors, /<strong>Razorpay<\/strong> — payment processing/);
  assert.match(processors, /we do not see or store card or bank details/);
});
