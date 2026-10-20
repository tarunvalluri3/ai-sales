import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import type { SuppressionReason } from "@/lib/email-suppression";

/**
 * Signature verification and event parsing for Resend's webhook
 * (app/api/webhooks/resend/route.ts), kept out of the route handler so the
 * handler stays thin (AGENTS.md §9) and so this can be exercised directly.
 *
 * Resend delivers webhooks through Svix. Verified by hand with node:crypto
 * rather than by adding the `svix` package -- same choice the WhatsApp
 * webhook already made for Meta's HMAC (app/api/webhooks/whatsapp/route.ts),
 * and AGENTS.md §9 asks for no dependency that duplicates something this
 * small. The scheme, per Svix's own manual-verification docs:
 *
 *   key       = base64-decode(secret without its "whsec_" prefix)
 *   content   = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature = base64(HMAC-SHA256(key, content))
 *   header    = space-separated "v1,<signature>" entries -- usually one,
 *               more during a secret rotation; any one matching is enough
 *
 * The raw body must be verified byte-for-byte as received; parsing and
 * re-serialising the JSON first would change it and fail every request.
 */

/** Svix's own library default. Rejects replays of a captured request. */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export function verifyResendSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const provided = Buffer.from(value, "base64");
    // timingSafeEqual throws on a length mismatch, so check it first.
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });
}

const eventSchema = z.object({
  type: z.string(),
  data: z.object({
    to: z.array(z.string()).optional(),
    bounce: z
      .object({
        type: z.string().optional(),
        subType: z.string().optional(),
      })
      .optional(),
  }),
});

export type SuppressionEvent = { emails: string[]; reason: SuppressionReason; detail: string | null };

/**
 * Maps a verified webhook body to the suppressions it implies, or `null`
 * for every other event type -- which the route still acknowledges with a
 * 200, since a non-2xx tells Svix to keep retrying an event this app will
 * never act on.
 *
 * Only *permanent* bounces suppress. Resend documents `email.bounced` as
 * firing only for permanent rejections (transient trouble arrives as
 * `email.delivery_delayed` instead), but the bounce type is checked anyway:
 * suppressing on a soft bounce would permanently silence a prospect whose
 * inbox was briefly full.
 */
export function parseSuppressionEvent(rawBody: string): SuppressionEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return null;

  const { type, data } = parsed.data;
  const emails = (data.to ?? []).filter((address) => address.includes("@"));
  if (emails.length === 0) return null;

  if (type === "email.complained") {
    return { emails, reason: "complaint", detail: null };
  }

  if (type === "email.bounced") {
    const bounceType = data.bounce?.type;
    if (bounceType && bounceType !== "Permanent") return null;
    // subType only (e.g. "General", "Suppressed") -- short, Resend-authored,
    // and never contains message content.
    return { emails, reason: "hard_bounce", detail: data.bounce?.subType ?? null };
  }

  return null;
}
