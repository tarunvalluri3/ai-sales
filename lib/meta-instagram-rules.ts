import crypto from "node:crypto";

/**
 * Pure decision rules for the Instagram API with Unified Login integration:
 * no I/O, no env, no server-only, so scripts/run-meta-instagram-tests.mjs
 * imports them directly. The routes and lib/instagram*.ts call these; the
 * tests pin their behavior.
 */

/** Instagram only allows a standard reply within 24 hours of the person's last message. */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long a connect attempt's CSRF state stays usable. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** The webhook fields every connected account is subscribed to. */
export const SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_reactions", "messaging_seen"] as const;

// ------------------------------------------------------------ webhook auth

/** `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body, keyed with the app secret>`, compared in constant time. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const providedBuffer = Buffer.from(provided, "hex");
  return providedBuffer.length === expected.length && crypto.timingSafeEqual(providedBuffer, expected);
}

/** Meta's GET verification handshake. Returns the challenge to echo, or null for a 403. */
export function resolveVerificationChallenge(
  params: { mode: string | null; token: string | null; challenge: string | null },
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken || params.mode !== "subscribe" || !params.token || !params.challenge) return null;
  const a = Buffer.from(params.token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return params.challenge;
}

// ------------------------------------------------------------ OAuth state

export type OAuthStateRow = { business_id: string; initiated_by_user_id: string; expires_at: string };

export type StateCheck = { ok: true; businessId: string; userId: string } | { ok: false; reason: "missing" | "expired" };

/** The state row was already deleted on read (single use); this only decides whether it is still usable. */
export function checkOAuthState(row: OAuthStateRow | null, now: Date): StateCheck {
  if (!row) return { ok: false, reason: "missing" };
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, businessId: row.business_id, userId: row.initiated_by_user_id };
}

/** Builds the Facebook Login for Business dialog URL (Instagram API with Unified Login). */
export function buildUnifiedLoginUrl(input: {
  appId: string;
  configId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("config_id", input.configId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", input.state);
  return url.toString();
}

// ------------------------------------------------------------ inbound events

export type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
  read?: unknown;
  reaction?: unknown;
  postback?: unknown;
};

export type InstagramWebhookBody = {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: InstagramMessagingEvent[] }[];
};

export type InboundMessage = {
  accountId: string;
  senderId: string;
  mid: string;
  /** Text as Meta sent it, or null for a non-text message (attachment, sticker, story reply without text...). */
  text: string | null;
};

/**
 * Picks the prospect messages worth storing out of a webhook payload:
 * only `object: "instagram"`; skips echoes and anything our own account
 * sent (sender === the receiving account); skips reads, reactions and
 * postbacks (subscribed so Meta's app review sees them, nothing to store);
 * and drops a message id seen earlier in the same payload. Cross-delivery
 * duplicates are caught by the unique `instagram_inbound_messages` insert.
 */
export function extractInboundMessages(body: InstagramWebhookBody): InboundMessage[] {
  if (body.object !== "instagram") return [];
  const seen = new Set<string>();
  const result: InboundMessage[] = [];

  for (const entry of body.entry ?? []) {
    const accountId = entry.id;
    if (!accountId || !Array.isArray(entry.messaging)) continue;

    for (const event of entry.messaging) {
      const message = event.message;
      const senderId = event.sender?.id;
      if (!message || !message.mid || !senderId) continue;
      if (message.is_echo) continue;
      if (senderId === accountId) continue;
      if (seen.has(message.mid)) continue;
      seen.add(message.mid);

      const text = typeof message.text === "string" && message.text.length > 0 ? message.text : null;
      result.push({ accountId, senderId, mid: message.mid, text });
    }
  }

  return result;
}

// ------------------------------------------------------------ sending

/** True when a standard (untagged) reply is still allowed. */
export function isWithinMessagingWindow(lastInboundAt: string | Date | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return false;
  const age = now.getTime() - last;
  return age >= 0 ? age <= MESSAGING_WINDOW_MS : true;
}

export type GraphError = { code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };

/**
 * Meta's "this token no longer works" errors: code 190 (invalid, expired or
 * revoked access token) and code 102 (API session). Code 10 is NOT treated
 * as revoked: Instagram also returns it for a send outside the 24-hour
 * window (subcode 2534022), which must not disconnect the account.
 */
export function isRevokedTokenError(httpStatus: number, error: GraphError | null | undefined): boolean {
  if (!error || typeof error.code !== "number") return httpStatus === 401;
  return error.code === 190 || error.code === 102;
}

/** Meta refused a send because the 24-hour window has closed (code 10, subcode 2534022). */
export function isOutsideWindowError(error: GraphError | null | undefined): boolean {
  return error?.code === 10 && error.error_subcode === 2534022;
}

/** Reads `{ error: { code, error_subcode, type } }` out of a Graph API error body without trusting its shape. */
export function readGraphError(body: unknown): GraphError | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const { code, error_subcode, type, fbtrace_id } = error as Record<string, unknown>;
  return {
    code: typeof code === "number" ? code : undefined,
    error_subcode: typeof error_subcode === "number" ? error_subcode : undefined,
    type: typeof type === "string" ? type : undefined,
    ...(typeof fbtrace_id === "string" && /^[\w-]{1,64}$/.test(fbtrace_id) ? { fbtrace_id } : {}),
  };
}
