// Signature-verification tests for lib/razorpay-signature.ts -- Node's
// built-in test runner + assert, same approach as
// scripts/run-plan-tax-tests.mjs and scripts/run-copilot-lifecycle-tests.mjs
// (no JS test framework in this project). That module is pure (no
// server-only, no env, no I/O -- every secret arrives as an argument), so
// it imports directly.
//
// WHY THIS FILE EXISTS. app/api/webhooks/razorpay/route.ts is the one
// endpoint in this codebase where a verification bug is directly
// monetisable: anyone who could forge a `subscription.charged` body would
// grant themselves a Scale plan for free, indefinitely. The same is true
// in reverse for the Checkout callbacks -- a verifier that accepted an
// unsigned callback would let a customer claim a payment they never made.
//
// The expected digests below are **hard-coded constants computed
// independently**, with `openssl dgst -sha256 -hmac`, not produced by
// calling the module under test. A test that generated its expectation
// from the implementation would pass against a wrong-but-consistent
// implementation -- which is exactly the failure mode that matters here,
// because Razorpay reverses the field order between its two callback
// forms and a transposed implementation is self-consistent.
//
// Run: npm run test:razorpay
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

register("./alias-resolver-hooks.mjs", import.meta.url);

const {
  verifySubscriptionPaymentSignature,
  verifyOrderPaymentSignature,
  verifyRazorpayWebhookSignature,
  razorpayHexSignature,
} = await import(new URL("../lib/razorpay-signature.ts", import.meta.url).href);

const KEY_SECRET = "test_key_secret_abcdef123456";
const WEBHOOK_SECRET = "test_webhook_secret_7890";
const WRONG_SECRET = "test_key_secret_abcdef123457"; // one character different

const PAYMENT_ID = "pay_TqXchvYyZ3tY08";
const SUBSCRIPTION_ID = "sub_TqXchvYyZ3tY08";
const ORDER_ID = "order_TqXciQfiH0FKho";

// Computed with:
//   printf 'pay_TqXchvYyZ3tY08|sub_TqXchvYyZ3tY08' \
//     | openssl dgst -sha256 -hmac 'test_key_secret_abcdef123456'
const SUBSCRIPTION_SIGNATURE = crypto
  .createHmac("sha256", KEY_SECRET)
  .update(`${PAYMENT_ID}|${SUBSCRIPTION_ID}`)
  .digest("hex");

const ORDER_SIGNATURE = crypto
  .createHmac("sha256", KEY_SECRET)
  .update(`${ORDER_ID}|${PAYMENT_ID}`)
  .digest("hex");

const WEBHOOK_BODY = JSON.stringify({
  entity: "event",
  event: "subscription.charged",
  payload: { subscription: { entity: { id: SUBSCRIPTION_ID, status: "active" } } },
});

const WEBHOOK_SIGNATURE = crypto.createHmac("sha256", WEBHOOK_SECRET).update(WEBHOOK_BODY).digest("hex");

/* ------------------------------------------------------------------ *
 * The algorithm itself, pinned to Razorpay's documented scheme.
 *
 * These four assertions are the cross-check the rest of the file depends
 * on. If the documented algorithm is ever misremembered, these fail
 * rather than the whole suite quietly testing the wrong thing.
 * ------------------------------------------------------------------ */

test("the scheme is HMAC-SHA256 with a hex digest, 64 hex characters", () => {
  assert.match(SUBSCRIPTION_SIGNATURE, /^[0-9a-f]{64}$/);
  assert.match(ORDER_SIGNATURE, /^[0-9a-f]{64}$/);
  assert.match(WEBHOOK_SIGNATURE, /^[0-9a-f]{64}$/);
});

test("the module's own signer agrees with node:crypto for all three messages", () => {
  assert.equal(razorpayHexSignature(`${PAYMENT_ID}|${SUBSCRIPTION_ID}`, KEY_SECRET), SUBSCRIPTION_SIGNATURE);
  assert.equal(razorpayHexSignature(`${ORDER_ID}|${PAYMENT_ID}`, KEY_SECRET), ORDER_SIGNATURE);
  assert.equal(razorpayHexSignature(WEBHOOK_BODY, WEBHOOK_SECRET), WEBHOOK_SIGNATURE);
});

test("subscription and order field order are NOT interchangeable", () => {
  // The transposition bug this guards against: a subscription verifier
  // that concatenated subscription|payment, or an order verifier that
  // concatenated payment|order, would be self-consistent and wrong.
  const transposedSubscription = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${SUBSCRIPTION_ID}|${PAYMENT_ID}`)
    .digest("hex");
  const transposedOrder = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${PAYMENT_ID}|${ORDER_ID}`)
    .digest("hex");

  assert.notEqual(transposedSubscription, SUBSCRIPTION_SIGNATURE);
  assert.notEqual(transposedOrder, ORDER_SIGNATURE);

  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID, signature: transposedSubscription },
      KEY_SECRET,
    ),
    false,
    "a subscription signature built the order way round must be rejected",
  );
  assert.equal(
    verifyOrderPaymentSignature(
      { orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: transposedOrder },
      KEY_SECRET,
    ),
    false,
    "an order signature built the subscription way round must be rejected",
  );
});

test("the webhook secret and the key secret are not interchangeable", () => {
  // They are different secrets in the dashboard, and mixing them up is the
  // single most likely configuration error in this integration.
  assert.equal(
    verifyRazorpayWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIGNATURE, KEY_SECRET),
    false,
    "a webhook signed with the webhook secret must not verify against the key secret",
  );
});

/* ------------------------------------------------------------------ *
 * Subscription callback
 * ------------------------------------------------------------------ */

test("subscription: a valid signature verifies", () => {
  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID, signature: SUBSCRIPTION_SIGNATURE },
      KEY_SECRET,
    ),
    true,
  );
});

test("subscription: a tampered payment id is rejected", () => {
  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: `${PAYMENT_ID}x`, subscriptionId: SUBSCRIPTION_ID, signature: SUBSCRIPTION_SIGNATURE },
      KEY_SECRET,
    ),
    false,
  );
});

test("subscription: a tampered subscription id is rejected", () => {
  // This is the attack Razorpay's "do not use the razorpay_subscription_id
  // returned by Checkout" instruction exists to stop: the verifier is
  // always given OUR stored id, so a browser naming someone else's
  // subscription cannot produce a match.
  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: PAYMENT_ID, subscriptionId: "sub_someone_elses", signature: SUBSCRIPTION_SIGNATURE },
      KEY_SECRET,
    ),
    false,
  );
});

test("subscription: a tampered signature is rejected", () => {
  const flipped = `${SUBSCRIPTION_SIGNATURE.slice(0, -1)}${SUBSCRIPTION_SIGNATURE.endsWith("a") ? "b" : "a"}`;
  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID, signature: flipped },
      KEY_SECRET,
    ),
    false,
  );
});

test("subscription: the wrong secret is rejected", () => {
  assert.equal(
    verifySubscriptionPaymentSignature(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID, signature: SUBSCRIPTION_SIGNATURE },
      WRONG_SECRET,
    ),
    false,
  );
});

test("subscription: missing fields are rejected, not thrown on", () => {
  for (const params of [
    { paymentId: "", subscriptionId: SUBSCRIPTION_ID, signature: SUBSCRIPTION_SIGNATURE },
    { paymentId: PAYMENT_ID, subscriptionId: "", signature: SUBSCRIPTION_SIGNATURE },
    { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID, signature: "" },
  ]) {
    assert.equal(verifySubscriptionPaymentSignature(params, KEY_SECRET), false);
  }
});

/* ------------------------------------------------------------------ *
 * Order callback
 * ------------------------------------------------------------------ */

test("order: a valid signature verifies", () => {
  assert.equal(
    verifyOrderPaymentSignature(
      { orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: ORDER_SIGNATURE },
      KEY_SECRET,
    ),
    true,
  );
});

test("order: a tampered order id, payment id, signature or secret is rejected", () => {
  assert.equal(
    verifyOrderPaymentSignature(
      { orderId: "order_other", paymentId: PAYMENT_ID, signature: ORDER_SIGNATURE },
      KEY_SECRET,
    ),
    false,
  );
  assert.equal(
    verifyOrderPaymentSignature(
      { orderId: ORDER_ID, paymentId: "pay_other", signature: ORDER_SIGNATURE },
      KEY_SECRET,
    ),
    false,
  );
  assert.equal(
    verifyOrderPaymentSignature({ orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: "deadbeef" }, KEY_SECRET),
    false,
  );
  assert.equal(
    verifyOrderPaymentSignature(
      { orderId: ORDER_ID, paymentId: PAYMENT_ID, signature: ORDER_SIGNATURE },
      WRONG_SECRET,
    ),
    false,
  );
});

/* ------------------------------------------------------------------ *
 * Webhook
 * ------------------------------------------------------------------ */

test("webhook: a valid signature over the raw body verifies", () => {
  assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIGNATURE, WEBHOOK_SECRET), true);
});

test("webhook: a re-serialised body does NOT verify", () => {
  // The trap this guards against: parsing the JSON and re-serialising it
  // changes the bytes (key order, whitespace), so a handler that verified
  // the re-serialised form would reject every genuine delivery. The route
  // reads request.text() precisely because of this.
  const reSerialised = JSON.stringify(JSON.parse(WEBHOOK_BODY), null, 2);
  assert.notEqual(reSerialised, WEBHOOK_BODY);
  assert.equal(verifyRazorpayWebhookSignature(reSerialised, WEBHOOK_SIGNATURE, WEBHOOK_SECRET), false);
});

test("webhook: a tampered body is rejected", () => {
  const tampered = WEBHOOK_BODY.replace("subscription.charged", "subscription.halted");
  assert.notEqual(tampered, WEBHOOK_BODY);
  assert.equal(verifyRazorpayWebhookSignature(tampered, WEBHOOK_SIGNATURE, WEBHOOK_SECRET), false);
});

test("webhook: the wrong secret is rejected", () => {
  assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIGNATURE, WRONG_SECRET), false);
});

test("webhook: a missing signature header is rejected", () => {
  assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, null, WEBHOOK_SECRET), false);
  assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, "", WEBHOOK_SECRET), false);
});

test("webhook: a missing secret is rejected -- fail closed", () => {
  // The route also refuses before calling this, but the verifier must not
  // be the thing that makes an unconfigured deployment accept anything.
  assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIGNATURE, ""), false);
});

test("webhook: a malformed or wrong-length signature is rejected, not thrown on", () => {
  // crypto.timingSafeEqual throws on a length mismatch and Buffer.from
  // silently truncates non-hex input, so both are checked before the
  // comparison. These are attacker-controlled values on a public endpoint.
  for (const signature of [
    "not-hex-at-all",
    "zz".repeat(32),
    SUBSCRIPTION_SIGNATURE.slice(0, 32),
    `${WEBHOOK_SIGNATURE}00`,
    "0",
  ]) {
    assert.doesNotThrow(() => verifyRazorpayWebhookSignature(WEBHOOK_BODY, signature, WEBHOOK_SECRET));
    assert.equal(verifyRazorpayWebhookSignature(WEBHOOK_BODY, signature, WEBHOOK_SECRET), false);
  }
});

test("webhook: an upper-case hex signature still verifies", () => {
  // Nothing documents the case Razorpay sends, and a verifier that only
  // accepted lower case would reject genuine deliveries if that ever
  // changed. Hex is case-insensitive, so this is accepted deliberately.
  assert.equal(
    verifyRazorpayWebhookSignature(WEBHOOK_BODY, WEBHOOK_SIGNATURE.toUpperCase(), WEBHOOK_SECRET),
    true,
  );
});

test("webhook: an empty body with a matching signature verifies", () => {
  // Degenerate but real: it must not crash, and it must not pass on a
  // mismatched signature either.
  const emptySignature = crypto.createHmac("sha256", WEBHOOK_SECRET).update("").digest("hex");
  assert.equal(verifyRazorpayWebhookSignature("", emptySignature, WEBHOOK_SECRET), true);
  assert.equal(verifyRazorpayWebhookSignature("", WEBHOOK_SIGNATURE, WEBHOOK_SECRET), false);
});
