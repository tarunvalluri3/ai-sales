import crypto from "node:crypto";

/**
 * Every HMAC Razorpay asks us to verify, in one place. Phase 17b (STATE.md).
 *
 * There are **three different signatures** in a Razorpay integration and
 * they are easy to confuse, which is exactly why they live together here
 * with their inputs spelled out:
 *
 * | What                      | Message                                | Key            |
 * |---------------------------|----------------------------------------|----------------|
 * | Checkout, subscription    | `payment_id` + "\|" + `subscription_id` | API key secret |
 * | Checkout, one-time order  | `order_id` + "\|" + `payment_id`        | API key secret |
 * | Webhook                   | the raw request body, byte for byte     | webhook secret |
 *
 * Note that the field order is **reversed** between the subscription and
 * the order form -- payment first for a subscription, order first for an
 * order. That is Razorpay's documented behaviour, not a transcription
 * slip, and getting it backwards produces a verifier that rejects every
 * genuine payment (or, far worse if the two were ever symmetric, accepts a
 * forged one). Cross-checked against Razorpay's own integration guide
 * while writing this, and asserted both ways in
 * scripts/run-razorpay-signature-tests.mjs.
 *
 * All three are HMAC-SHA256 with a **hex** digest (unlike Resend/Svix,
 * which is base64 over a dotted payload -- see lib/resend-webhook.ts).
 * Verified by hand with `node:crypto` rather than by adding the
 * `razorpay` npm package, matching the choice the WhatsApp, Instagram and
 * Resend webhooks already made for their own HMACs (AGENTS.md section 9
 * asks for no dependency that duplicates something this small).
 *
 * **No `server-only` here, deliberately.** This module is pure -- no env
 * access, no I/O, no secrets of its own: every secret arrives as an
 * argument. That is what lets plain Node import it for unit tests, the
 * same way lib/plans.ts is imported by scripts/run-plan-tax-tests.mjs.
 * Nothing in it is useful to a client bundle, and nothing client-side
 * imports it.
 */

/**
 * Constant-time comparison of a provided hex digest against an expected
 * one. `timingSafeEqual` throws on a length mismatch, so the length is
 * checked first -- and a non-hex or wrong-length signature is simply
 * false, never an exception, because this is called with attacker-supplied
 * input on a public endpoint.
 */
function matchesHexDigest(provided: string, expected: Buffer): boolean {
  if (!/^[0-9a-f]+$/i.test(provided)) return false;
  const providedBuffer = Buffer.from(provided.toLowerCase(), "hex");
  if (providedBuffer.length !== expected.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expected);
}

function hmacSha256(message: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest();
}

/**
 * Razorpay Checkout's callback after a **subscription** mandate is
 * authorised: `HMAC_SHA256(razorpay_payment_id + "|" + subscriptionId)`,
 * keyed with the API key secret.
 *
 * `subscriptionId` must be **our stored** `razorpay_subscription_id`, not
 * the `razorpay_subscription_id` Checkout handed the browser -- Razorpay's
 * guide says so explicitly, and the reason is that verifying a signature
 * against a value supplied by the same client that supplied the signature
 * proves nothing about which subscription was really paid for.
 */
export function verifySubscriptionPaymentSignature(
  params: { paymentId: string; subscriptionId: string; signature: string },
  keySecret: string,
): boolean {
  const { paymentId, subscriptionId, signature } = params;
  if (!paymentId || !subscriptionId || !signature) return false;
  return matchesHexDigest(signature, hmacSha256(`${paymentId}|${subscriptionId}`, keySecret));
}

/**
 * Razorpay Checkout's callback after a **one-time order** is paid (this
 * app's annual plan): `HMAC_SHA256(orderId + "|" + razorpay_payment_id)`,
 * keyed with the API key secret. Order id first -- the opposite way round
 * from the subscription form above.
 *
 * `orderId` is likewise our stored id, for the same reason.
 */
export function verifyOrderPaymentSignature(
  params: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  const { orderId, paymentId, signature } = params;
  if (!orderId || !paymentId || !signature) return false;
  return matchesHexDigest(signature, hmacSha256(`${orderId}|${paymentId}`, keySecret));
}

/**
 * The `X-Razorpay-Signature` header on a webhook delivery:
 * `HMAC_SHA256(raw request body)` keyed with the **webhook secret**, which
 * is a different secret from the API key secret and is shown only once,
 * in the dashboard, when the endpoint is created.
 *
 * `rawBody` must be the body exactly as received. Parsing the JSON and
 * re-serialising it changes the bytes (key order, whitespace, unicode
 * escaping) and would fail every genuine delivery -- the same trap
 * lib/resend-webhook.ts documents.
 *
 * There is deliberately **no timestamp tolerance** here, unlike the Resend
 * verifier: Razorpay signs only the body, so there is no signed timestamp
 * to check, and inventing one from the payload's own `created_at` would be
 * checking an attacker-supplied value. Replay protection is a separate
 * mechanism and a stronger one -- the `x-razorpay-event-id` dedupe ledger
 * in `public.razorpay_webhook_events`, which makes a replayed event a
 * no-op rather than merely a rejected one.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): boolean {
  if (!signature || !webhookSecret) return false;
  return matchesHexDigest(signature, hmacSha256(rawBody, webhookSecret));
}

/**
 * Used only by the signature tests and by local verification scripts, so
 * that a test computing an expected signature cannot accidentally be
 * testing its own re-implementation of the production path against
 * itself... which is why the tests also carry hard-coded digests computed
 * independently. Never used to produce a signature we send: this app signs
 * nothing for Razorpay.
 */
export function razorpayHexSignature(message: string, secret: string): string {
  return hmacSha256(message, secret).toString("hex");
}
