import crypto from "node:crypto";
import { z } from "zod";

/**
 * Verifies the `signed_request` Meta POSTs to the deauthorize and data
 * deletion callbacks. Format (Meta's documented one): `<sig>.<payload>`,
 * both base64url; `sig` is the raw HMAC-SHA256 of the *encoded* payload
 * string, keyed with the app secret. The payload is JSON containing
 * `algorithm: "HMAC-SHA256"` and the app-scoped `user_id`.
 *
 * Pure (no server-only, no env, no I/O -- the secret arrives as an
 * argument) so scripts/run-meta-signed-request-tests.mjs can import it.
 * The signature is checked BEFORE the payload is parsed, so an unsigned or
 * tampered body never reaches JSON.parse. Never logs the body or secret.
 */

const payloadSchema = z.object({
  algorithm: z.string(),
  // Meta ids are numeric. Enforcing digits here also keeps the value safe to
  // use inside a PostgREST filter string downstream.
  user_id: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,32}$/)),
});

export type MetaSignedRequestResult = { ok: true; userId: string } | { ok: false };

export function verifyMetaSignedRequest(
  signedRequest: unknown,
  appSecret: string | undefined,
): MetaSignedRequestResult {
  if (typeof signedRequest !== "string" || !appSecret) return { ok: false };

  const parts = signedRequest.split(".");
  if (parts.length !== 2) return { ok: false };
  const [encodedSignature, encodedPayload] = parts;
  if (!encodedSignature || !encodedPayload) return { ok: false };

  const provided = Buffer.from(encodedSignature, "base64url");
  const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false };
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false };
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.algorithm.toUpperCase() !== "HMAC-SHA256") return { ok: false };

  return { ok: true, userId: parsed.data.user_id };
}

/** Reads `signed_request` from a form-encoded (Meta's format) or JSON body. */
export async function readSignedRequestField(request: Request): Promise<string | null> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { signed_request?: unknown };
      return typeof body.signed_request === "string" ? body.signed_request : null;
    }
    const value = (await request.formData()).get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
