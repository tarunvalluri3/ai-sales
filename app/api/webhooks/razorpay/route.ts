import { NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createRazorpayWebhookDeps } from "@/lib/billing-store";
import { getRazorpayWebhookSecret } from "@/lib/razorpay";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay-signature";
import { parseRazorpayWebhookBody, processRazorpayEvent } from "@/lib/razorpay-webhook";
import { logEvent } from "@/lib/logger";

/**
 * Razorpay's subscription/payment webhook (Phase 17b, STATE.md).
 *
 * **This endpoint, not the browser, is the source of truth for
 * subscription state.** The Checkout callback is UI -- it lets the
 * dashboard show the right thing without a refresh. A customer who closes
 * the tab mid-payment must not leave us inconsistent with the money, so
 * every state transition lives behind this handler.
 *
 * Register it in the Razorpay dashboard (Account & Settings -> Webhooks ->
 * Add New Webhook) at `https://<your-domain>/api/webhooks/razorpay`,
 * subscribed to: `subscription.activated`, `subscription.charged`,
 * `subscription.pending`, `subscription.halted`, `subscription.cancelled`,
 * `subscription.completed`, `payment.failed`, `order.paid` and (Phase 17c)
 * `refund.processed`, which is what issues the GST credit note for a
 * refund -- including one made by hand in the Razorpay dashboard. Put the
 * secret it shows you in `RAZORPAY_WEBHOOK_SECRET`.
 *
 * **Fails closed, exactly like app/api/webhooks/resend/route.ts**: with no
 * secret configured every request is refused, rather than either breaking
 * startup or accepting an unverified body. That posture matters more here
 * than anywhere else in this codebase -- an unauthenticated version of
 * this endpoint would let anyone POST a `subscription.charged` and grant
 * themselves a Scale plan, indefinitely, for free.
 *
 * All the logic lives in lib/razorpay-webhook.ts (pure, unit-tested) and
 * lib/billing-store.ts (the database/mail/audit wiring); this stays a thin
 * handler, per AGENTS.md section 9.
 */
export async function POST(request: NextRequest) {
  const secret = getRazorpayWebhookSecret();
  // Read the body as text, byte for byte. Parsing and re-serialising it
  // would change the bytes and fail every genuine signature.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const verified = Boolean(secret) && verifyRazorpayWebhookSignature(rawBody, signature, secret as string);

  if (!verified) {
    logEvent(
      "razorpay_webhook_rejected",
      "unknown",
      { configured: Boolean(secret), hasSignature: Boolean(signature) },
      "error",
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const body = parseRazorpayWebhookBody(rawBody);
  if (!body) {
    // Verified as Razorpay's but not a shape this app recognises. 200, not
    // 400: retrying will produce the same unparseable body forever.
    logEvent("razorpay_webhook_unparseable", "unknown", {}, "error");
    return new Response(null, { status: 200 });
  }

  /**
   * The dedupe key. Razorpay sends a unique id per event in
   * `x-razorpay-event-id` and retries until it gets a 2xx, so this is what
   * stops a replayed charge extending a billing period twice.
   *
   * Without the header there is nothing safe to do: a money-moving event
   * we cannot identify cannot be deduped, and processing it blind risks
   * double-applying it. Refused with a 400 so the delivery is visibly
   * failing in the dashboard rather than silently dropped -- and logged at
   * error level, because in practice it would mean Razorpay changed the
   * header.
   */
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId) {
    logEvent("razorpay_webhook_missing_event_id", "unknown", { event: body.event.slice(0, 64) }, "error");
    return new Response("Missing event id", { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const outcome = await processRazorpayEvent(createRazorpayWebhookDeps(supabase), body, eventId);
    logEvent("razorpay_webhook_handled", "unknown", { event: body.event.slice(0, 64), outcome });
  } catch (error) {
    // A database write failed. Non-2xx on purpose, so Razorpay retries --
    // and `processRazorpayEvent` has already released this event's dedupe
    // claim, so the retry does real work rather than being skipped as a
    // duplicate.
    logEvent("razorpay_webhook_processing_failed", "unknown", { event: body.event.slice(0, 64) }, "error");
    console.error(error);
    return new Response("Processing failed", { status: 500 });
  }

  // 200 for every verified event, including the types this app ignores and
  // the duplicates it declines to re-apply: anything else makes Razorpay
  // retry an event that will never be acted on.
  return new Response(null, { status: 200 });
}
