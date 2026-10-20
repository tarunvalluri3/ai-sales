import { NextRequest } from "next/server";
import { recordEmailSuppression } from "@/lib/email-suppression";
import { parseSuppressionEvent, verifyResendSignature } from "@/lib/resend-webhook";
import { logEvent } from "@/lib/logger";

/**
 * Resend's bounce/complaint webhook (2026-10-19). Register this URL in the
 * Resend dashboard (Webhooks → Add endpoint →
 * `https://<your-domain>/api/webhooks/resend`), subscribe it to
 * `email.bounced` and `email.complained`, and put the signing secret it
 * shows you in `RESEND_WEBHOOK_SECRET`.
 *
 * Fails closed, same as the WhatsApp and Instagram webhooks: with no secret
 * configured every request is refused, rather than either breaking startup
 * or accepting an unverified body that could suppress arbitrary addresses
 * -- an unauthenticated version of this endpoint would let anyone switch
 * off a business's email to its own prospects.
 *
 * All the logic lives in lib/resend-webhook.ts; this stays a thin handler.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();

  const verified =
    Boolean(secret) &&
    verifyResendSignature(
      rawBody,
      {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      secret as string,
    );

  if (!verified) {
    logEvent("resend_webhook_rejected", "unknown", { configured: Boolean(secret) }, "error");
    return new Response("Unauthorized", { status: 401 });
  }

  const event = parseSuppressionEvent(rawBody);
  if (event) {
    for (const email of event.emails) {
      await recordEmailSuppression(email, event.reason, event.detail);
    }
  }

  // 200 for everything verified, including event types this app ignores:
  // anything else makes Svix retry an event that will never be acted on.
  return new Response(null, { status: 200 });
}
