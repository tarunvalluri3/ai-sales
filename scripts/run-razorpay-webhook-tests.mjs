// Webhook state-machine tests for lib/razorpay-webhook.ts, including the
// idempotency case that matters most: the same `subscription.charged`
// delivered twice must extend the billing period exactly once.
//
// lib/razorpay-webhook.ts takes every outside dependency as an argument
// (RazorpayWebhookDeps) specifically so this file can drive the real
// transitions against an in-memory store -- no database, no Supabase, no
// network. That is also why it has no `server-only` import.
//
// Run: npm run test:razorpay
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./alias-resolver-hooks.mjs", import.meta.url);

const { processRazorpayEvent, annualPeriodFrom } = await import(
  new URL("../lib/razorpay-webhook.ts", import.meta.url).href
);
const { proRataUpgradeQuote, isUpgrade } = await import(
  new URL("../lib/billing-prorata.ts", import.meta.url).href
);
const { PLANS } = await import(new URL("../lib/plans.ts", import.meta.url).href);

const BUSINESS_ID = "00000000-0000-0000-0000-00000000000a";
const SUBSCRIPTION_ID = "sub_test_17b";

/** A `subscriptions` row, as lib/billing-store.ts would have read it. */
function rowFixture(overrides = {}) {
  return {
    business_id: BUSINESS_ID,
    plan_key: "growth",
    status: "active",
    trial_started_at: null,
    trial_ends_at: null,
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    scheduled_plan_key: null,
    past_due_since: null,
    billing_interval: "monthly",
    razorpay_subscription_id: SUBSCRIPTION_ID,
    razorpay_customer_id: null,
    razorpay_order_id: null,
    ...overrides,
  };
}

/**
 * An in-memory stand-in for the database, the mailer and the audit log.
 * The event ledger is a Set, which gives exactly the primary-key
 * behaviour `public.razorpay_webhook_events` gives: the first claim of an
 * id wins, every later one is refused.
 */
function makeDeps(row, { failUpdates = false } = {}) {
  const state = {
    row: row ? { ...row } : null,
    claimedEvents: new Set(),
    released: [],
    updates: [],
    notices: [],
    audits: [],
    logs: [],
  };

  const deps = {
    async claimEvent(eventId, event, businessId) {
      if (state.claimedEvents.has(eventId)) return false;
      state.claimedEvents.add(eventId);
      void event;
      void businessId;
      return true;
    },
    async releaseEvent(eventId) {
      state.claimedEvents.delete(eventId);
      state.released.push(eventId);
    },
    async findSubscriptionByRazorpayId(id) {
      return state.row && state.row.razorpay_subscription_id === id ? { ...state.row } : null;
    },
    async findSubscriptionByBusinessId(businessId) {
      return state.row && state.row.business_id === businessId ? { ...state.row } : null;
    },
    async updateSubscription(businessId, patch) {
      if (failUpdates) throw new Error("simulated database failure");
      state.updates.push({ businessId, patch });
      state.row = { ...state.row, ...patch };
    },
    async sendNotice(kind, r, context) {
      state.notices.push({ kind, businessId: r.business_id, ...context });
    },
    async recordAudit(businessId, action, metadata) {
      state.audits.push({ businessId, action, metadata });
    },
    log(event, businessId, metadata, level) {
      state.logs.push({ event, businessId, metadata, level });
    },
  };

  return { deps, state };
}

function chargedEvent({ start, end, paidCount = 2 }) {
  return {
    event: "subscription.charged",
    payload: {
      subscription: {
        entity: {
          id: SUBSCRIPTION_ID,
          status: "active",
          current_start: Math.floor(new Date(start).getTime() / 1000),
          current_end: Math.floor(new Date(end).getTime() / 1000),
          paid_count: paidCount,
          notes: { business_id: BUSINESS_ID },
        },
      },
      payment: { entity: { id: "pay_1", amount: PLANS.growth.monthlyPricePaise, status: "captured" } },
    },
  };
}

/* ================================================================== *
 * Idempotency -- the point of the whole ledger
 * ================================================================== */

test("the same subscription.charged delivered twice extends the period once", async () => {
  const { deps, state } = makeDeps(rowFixture());
  const event = chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });

  const first = await processRazorpayEvent(deps, event, "evt_charged_1");
  const second = await processRazorpayEvent(deps, event, "evt_charged_1");

  assert.equal(first, "processed");
  assert.equal(second, "duplicate", "the replay must be reported as a duplicate, not processed again");

  assert.equal(state.updates.length, 1, "exactly one write reached the row");
  assert.equal(state.row.current_period_end, "2026-12-01T00:00:00.000Z");
  assert.equal(state.row.current_period_start, "2026-11-01T00:00:00.000Z");
  assert.equal(state.audits.filter((a) => a.action === "subscription.charged").length, 1);
});

test("even without the ledger, a replayed charge assigns the same period rather than adding one", async () => {
  // The structural half of the guarantee: the period comes from Razorpay as
  // absolute timestamps, so re-applying the same event is a no-op on the
  // numbers. Proved by giving the second delivery a FRESH event id, which
  // bypasses the dedupe entirely.
  const { deps, state } = makeDeps(rowFixture());
  const event = chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });

  await processRazorpayEvent(deps, event, "evt_a");
  const periodAfterFirst = state.row.current_period_end;
  await processRazorpayEvent(deps, event, "evt_b");

  assert.equal(state.updates.length, 2, "both deliveries did write, since the ids differ");
  assert.equal(state.row.current_period_end, periodAfterFirst, "but the stored period is unchanged");
  assert.equal(state.row.current_period_end, "2026-12-01T00:00:00.000Z");
});

test("a failed write releases the event claim so the retry is a real second chance", async () => {
  const { deps, state } = makeDeps(rowFixture(), { failUpdates: true });
  const event = chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });

  await assert.rejects(() => processRazorpayEvent(deps, event, "evt_fail"));
  assert.deepEqual(state.released, ["evt_fail"]);
  assert.equal(state.claimedEvents.has("evt_fail"), false, "the claim must not survive a failed transition");
});

/* ================================================================== *
 * Transitions
 * ================================================================== */

test("subscription.charged converts a trialing row and mails it once", async () => {
  const { deps, state } = makeDeps(
    rowFixture({
      status: "trialing",
      plan_key: "growth",
      trial_started_at: "2026-10-01T00:00:00.000Z",
      trial_ends_at: "2026-10-15T00:00:00.000Z",
      current_period_start: null,
      current_period_end: null,
    }),
  );

  await processRazorpayEvent(
    deps,
    chargedEvent({ start: "2026-10-15T00:00:00.000Z", end: "2026-11-15T00:00:00.000Z", paidCount: 1 }),
    "evt_first_charge",
  );

  assert.equal(state.row.status, "active");
  assert.equal(state.row.current_period_end, "2026-11-15T00:00:00.000Z");
  assert.deepEqual(
    state.notices.map((n) => n.kind),
    ["subscription_active"],
  );
});

test("subscription.charged applies a scheduled downgrade at the period boundary", async () => {
  const { deps, state } = makeDeps(rowFixture({ plan_key: "scale", scheduled_plan_key: "growth" }));

  await processRazorpayEvent(
    deps,
    chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" }),
    "evt_downgrade",
  );

  assert.equal(state.row.plan_key, "growth", "the downgrade takes effect with the new period");
  assert.equal(state.row.scheduled_plan_key, null, "and is cleared, so it cannot be applied twice");
  assert.equal(state.row.current_period_start, "2026-11-01T00:00:00.000Z");
  assert.ok(state.audits.some((a) => a.action === "subscription.plan_changed"));
});

test("a mid-period charge sends no email -- only the first one and a recovery do", async () => {
  const { deps, state } = makeDeps(rowFixture({ status: "active" }));
  await processRazorpayEvent(
    deps,
    chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" }),
    "evt_routine",
  );
  assert.deepEqual(state.notices, [], "a routine monthly charge is not an email anyone asked for");
});

test("subscription.pending starts the grace once and does not restart it on a retry", async () => {
  const { deps, state } = makeDeps(rowFixture());
  const pending = {
    event: "subscription.pending",
    payload: { subscription: { entity: { id: SUBSCRIPTION_ID, status: "pending", notes: {} } } },
  };

  const firstFailure = new Date("2026-11-01T10:00:00.000Z");
  await processRazorpayEvent(deps, pending, "evt_pending_1", firstFailure);
  assert.equal(state.row.status, "past_due");
  assert.equal(state.row.past_due_since, firstFailure.toISOString());

  // A later retry, three days on. The clock must NOT restart, or a card
  // that never works would serve forever.
  const retry = new Date("2026-11-04T10:00:00.000Z");
  await processRazorpayEvent(deps, pending, "evt_pending_2", retry);
  assert.equal(
    state.row.past_due_since,
    firstFailure.toISOString(),
    "the grace stays anchored to the FIRST failure",
  );

  // The warning email is claimed against the grace deadline, so both
  // deliveries name the same period and the ledger collapses them to one.
  const deadlines = new Set(state.notices.filter((n) => n.kind === "payment_failed").map((n) => n.periodEndIso));
  assert.equal(deadlines.size, 1, "both retries claim the same deadline, so one email is sent");
  assert.equal([...deadlines][0], "2026-11-06T10:00:00.000Z", "five days after the first failure");
});

test("subscription.halted moves to the restricted state and emails the business", async () => {
  const { deps, state } = makeDeps(rowFixture({ status: "past_due", past_due_since: "2026-11-01T00:00:00.000Z" }));
  await processRazorpayEvent(
    deps,
    { event: "subscription.halted", payload: { subscription: { entity: { id: SUBSCRIPTION_ID, notes: {} } } } },
    "evt_halted",
  );

  assert.equal(state.row.status, "expired");
  assert.deepEqual(
    state.notices.map((n) => n.kind),
    ["grace_lapsed"],
  );
  assert.ok(state.audits.some((a) => a.action === "subscription.grace_lapsed"));
});

test("subscription.cancelled keeps access to the end of the paid period", async () => {
  const { deps, state } = makeDeps(rowFixture());
  await processRazorpayEvent(
    deps,
    { event: "subscription.cancelled", payload: { subscription: { entity: { id: SUBSCRIPTION_ID, notes: {} } } } },
    "evt_cancelled",
  );

  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.cancel_at_period_end, true);
  assert.equal(state.row.current_period_end, "2026-11-01T00:00:00.000Z", "the paid period is untouched");
  assert.equal(state.notices[0].periodEndIso, "2026-11-01T00:00:00.000Z");
});

test("cancelling a trialing mandate leaves the row trialing, not cancelled", async () => {
  // Writing `cancelled` on a row with no billing period would violate
  // subscriptions_period_dates_present -- the update would throw, the route
  // would answer 500, and Razorpay would retry an impossible write forever.
  const { deps, state } = makeDeps(
    rowFixture({
      status: "trialing",
      trial_started_at: "2026-10-01T00:00:00.000Z",
      trial_ends_at: "2026-10-15T00:00:00.000Z",
      current_period_start: null,
      current_period_end: null,
    }),
  );

  await processRazorpayEvent(
    deps,
    { event: "subscription.cancelled", payload: { subscription: { entity: { id: SUBSCRIPTION_ID, notes: {} } } } },
    "evt_trial_cancelled",
  );

  assert.equal(state.row.status, "trialing");
  assert.equal(state.row.cancel_at_period_end, true);
  assert.equal(state.notices[0].periodEndIso, "2026-10-15T00:00:00.000Z", "the date shown is the trial's end");
});

test("subscription.activated with no period yet writes nothing it cannot know", async () => {
  // A subscription whose start_at is in the future is `authenticated` with
  // no current period. Writing status 'active' would be a half-state the
  // quota logic would act on.
  const { deps, state } = makeDeps(
    rowFixture({ status: "trialing", current_period_start: null, current_period_end: null }),
  );
  const outcome = await processRazorpayEvent(
    deps,
    {
      event: "subscription.activated",
      payload: { subscription: { entity: { id: SUBSCRIPTION_ID, status: "authenticated", notes: {} } } },
    },
    "evt_activated_no_period",
  );

  assert.equal(outcome, "processed");
  assert.equal(state.updates.length, 0);
  assert.equal(state.row.status, "trialing");
});

test("payment.failed changes no subscription state", async () => {
  const { deps, state } = makeDeps(rowFixture());
  const outcome = await processRazorpayEvent(
    deps,
    {
      event: "payment.failed",
      payload: {
        payment: { entity: { id: "pay_bad", status: "failed", error_code: "BAD_REQUEST_ERROR", notes: { business_id: BUSINESS_ID } } },
      },
    },
    "evt_payment_failed",
  );

  assert.equal(outcome, "processed");
  assert.equal(state.updates.length, 0, "subscription.pending is the authoritative failure signal, not this");
  assert.deepEqual(state.notices, []);
});

test("an unhandled event type is ignored and acknowledged", async () => {
  const { deps, state } = makeDeps(rowFixture());
  const outcome = await processRazorpayEvent(deps, { event: "subscription.paused", payload: {} }, "evt_paused");
  assert.equal(outcome, "ignored");
  assert.equal(state.claimedEvents.size, 0, "an ignored event does not consume a ledger row");
  assert.equal(state.updates.length, 0);
});

test("a subscription event for a business we do not have is unresolved, not fatal", async () => {
  const { deps, state } = makeDeps(null);
  const outcome = await processRazorpayEvent(
    deps,
    { event: "subscription.charged", payload: { subscription: { entity: { id: "sub_unknown", notes: {} } } } },
    "evt_unknown",
  );
  assert.equal(outcome, "unresolved");
  assert.equal(state.updates.length, 0);
});

test("a subscription event matched only by notes repairs the stored id", async () => {
  const { deps, state } = makeDeps(rowFixture({ razorpay_subscription_id: null }));
  await processRazorpayEvent(
    deps,
    chargedEvent({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" }),
    "evt_by_notes",
  );
  assert.equal(state.row.razorpay_subscription_id, SUBSCRIPTION_ID);
  assert.equal(state.row.status, "active");
});

/* ================================================================== *
 * order.paid -- the annual path
 * ================================================================== */

function orderPaidEvent({ purpose, planKey, orderId = "order_test_17b", amountPaise }) {
  return {
    event: "order.paid",
    payload: {
      order: {
        entity: {
          id: orderId,
          amount: amountPaise,
          status: "paid",
          notes: { business_id: BUSINESS_ID, purpose, plan_key: planKey },
        },
      },
      payment: { entity: { id: "pay_annual", status: "captured" } },
    },
  };
}

test("order.paid for an annual plan sets a one-year period and drops the mandate id", async () => {
  const { deps, state } = makeDeps(rowFixture({ status: "trialing", current_period_start: null, current_period_end: null, trial_started_at: "2026-10-01T00:00:00.000Z", trial_ends_at: "2026-10-15T00:00:00.000Z" }));
  const now = new Date("2026-10-21T00:00:00.000Z");

  await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "annual", planKey: "scale", amountPaise: PLANS.scale.annualPricePaise }),
    "evt_order_annual",
    now,
  );

  assert.equal(state.row.status, "active");
  assert.equal(state.row.plan_key, "scale");
  assert.equal(state.row.billing_interval, "annual");
  assert.equal(state.row.current_period_end, annualPeriodFrom(now).end);
  assert.equal(state.row.current_period_end, "2027-10-21T00:00:00.000Z");
  assert.equal(
    state.row.razorpay_subscription_id,
    null,
    "an annual term is an order, so no subscription webhook may write this row",
  );
});

test("order.paid for an annual plan is a no-op when the Checkout callback already applied it", async () => {
  // The property that lets the callback be treated as UI: whichever path
  // arrives first wins, and the other changes nothing.
  const now = new Date("2026-10-21T00:00:00.000Z");
  const { deps, state } = makeDeps(
    rowFixture({
      status: "active",
      plan_key: "scale",
      billing_interval: "annual",
      razorpay_order_id: "order_test_17b",
      razorpay_subscription_id: null,
      current_period_start: now.toISOString(),
      current_period_end: "2027-10-21T00:00:00.000Z",
    }),
  );

  const outcome = await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "annual", planKey: "scale", amountPaise: PLANS.scale.annualPricePaise }),
    "evt_order_annual_again",
    now,
  );

  assert.equal(outcome, "processed");
  assert.equal(state.updates.length, 0, "nothing was rewritten");
});

test("order.paid for a pro-rata upgrade moves the plan and leaves the period alone", async () => {
  const { deps, state } = makeDeps(rowFixture({ plan_key: "starter" }));
  await processRazorpayEvent(
    deps,
    orderPaidEvent({ purpose: "upgrade_prorata", planKey: "growth", amountPaise: 123400 }),
    "evt_order_prorata",
  );

  assert.equal(state.row.plan_key, "growth");
  assert.equal(state.row.current_period_end, "2026-11-01T00:00:00.000Z", "the period is untouched");
  assert.ok(state.audits.some((a) => a.action === "subscription.plan_changed"));
});

test("order.paid with notes we did not write is unresolved, and grants nothing", async () => {
  const { deps, state } = makeDeps(rowFixture({ plan_key: "starter" }));
  const outcome = await processRazorpayEvent(
    deps,
    {
      event: "order.paid",
      payload: {
        order: { entity: { id: "order_rogue", status: "paid", notes: { business_id: BUSINESS_ID, purpose: "free_scale", plan_key: "scale" } } },
      },
    },
    "evt_order_rogue",
  );

  assert.equal(outcome, "unresolved");
  assert.equal(state.row.plan_key, "starter");
  assert.equal(state.updates.length, 0);
});

/* ================================================================== *
 * Pro-rata arithmetic
 * ================================================================== */

test("a pro-rata upgrade charges the difference in proportion to the time left", () => {
  const quote = proRataUpgradeQuote({
    fromPlanKey: "starter",
    toPlanKey: "growth",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-10-31T00:00:00.000Z",
    now: new Date("2026-10-16T00:00:00.000Z"),
  });

  const fullDifference = PLANS.growth.monthlyPricePaise - PLANS.starter.monthlyPricePaise;
  assert.equal(quote.fullDifferencePaise, fullDifference);
  assert.equal(quote.fullDifferencePaise, 250_000, "3999 - 1499 = 2500 rupees");
  // Exactly half the period remains.
  assert.equal(quote.amountPaise, fullDifference / 2);
  assert.equal(quote.remainingDays, 15);
  assert.equal(quote.totalDays, 30);
});

test("a pro-rata quote never exceeds the full difference and never goes negative", () => {
  const beforeStart = proRataUpgradeQuote({
    fromPlanKey: "starter",
    toPlanKey: "scale",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-11-01T00:00:00.000Z",
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  const full = PLANS.scale.monthlyPricePaise - PLANS.starter.monthlyPricePaise;
  assert.equal(beforeStart.amountPaise, full, "clamped at a full period's difference");

  const afterEnd = proRataUpgradeQuote({
    fromPlanKey: "starter",
    toPlanKey: "scale",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-11-01T00:00:00.000Z",
    now: new Date("2026-12-01T00:00:00.000Z"),
  });
  assert.equal(afterEnd.amountPaise, 0, "a period that is over has nothing left to charge for");
});

test("a downgrade quotes zero, and direction is judged by price", () => {
  const quote = proRataUpgradeQuote({
    fromPlanKey: "scale",
    toPlanKey: "starter",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-11-01T00:00:00.000Z",
    now: new Date("2026-10-15T00:00:00.000Z"),
  });
  assert.equal(quote.fullDifferencePaise, 0);
  assert.equal(quote.amountPaise, 0);

  assert.equal(isUpgrade("starter", "scale", "monthly"), true);
  assert.equal(isUpgrade("scale", "starter", "monthly"), false);
  assert.equal(isUpgrade("growth", "growth", "monthly"), false);
  assert.equal(isUpgrade("starter", "growth", "annual"), true);
});

test("a pro-rata amount is a GST-inclusive gross, so it splits like any other price", async () => {
  // The consequence for Phase 17c: a mid-period upgrade's invoice is an
  // ordinary invoice for a smaller gross, with no second tax rule.
  const { gstBreakdown } = await import(new URL("../lib/plans.ts", import.meta.url).href);
  const quote = proRataUpgradeQuote({
    fromPlanKey: "starter",
    toPlanKey: "growth",
    interval: "monthly",
    periodStartIso: "2026-10-01T00:00:00.000Z",
    periodEndIso: "2026-10-31T00:00:00.000Z",
    now: new Date("2026-10-16T00:00:00.000Z"),
  });
  const split = gstBreakdown(quote.amountPaise, "intra-state");
  assert.equal(split.taxablePaise + split.taxPaise, quote.amountPaise);
  assert.equal(split.cgstPaise + split.sgstPaise, split.taxPaise);
});

test("the annual period is calendar arithmetic, not 365 days", () => {
  // A leap year must not quietly give anyone a free day or charge them for
  // one they did not get.
  assert.equal(annualPeriodFrom(new Date("2027-02-28T00:00:00.000Z")).end, "2028-02-28T00:00:00.000Z");
  assert.equal(annualPeriodFrom(new Date("2028-02-29T00:00:00.000Z")).end, "2029-03-01T00:00:00.000Z");
});
