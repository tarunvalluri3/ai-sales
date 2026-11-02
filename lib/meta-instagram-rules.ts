import crypto from "node:crypto";

/**
 * Pure decision rules for the Instagram integration -- Instagram API with
 * Facebook Login by default, Instagram API with Unified Login behind
 * META_IG_LOGIN_MODE=unified. No I/O, no env, no server-only, so
 * scripts/run-meta-instagram-tests.mjs imports them directly. The routes and
 * lib/instagram*.ts call these; the tests pin their behavior.
 */

/** Instagram only allows a standard reply within 24 hours of the person's last message. */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How long a connect attempt's CSRF state stays usable. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Unified Login: the webhook fields every connected account is subscribed to (POST /<IG_ID>/subscribed_apps). */
export const SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_reactions", "messaging_seen"] as const;

/**
 * Facebook Login: the field sent on POST /<PAGE_ID>/subscribed_apps. This
 * call only links the Page to our app; Instagram DMs arrive through the
 * APP-LEVEL "instagram" webhook object (App Dashboard), not through Page
 * fields. Meta, "Webhooks for Instagram" (Graph API): "Your app must enable
 * Page subscriptions on the Page connected to the app user's account by
 * sending a POST request to the Page Subscribed Apps edge and subscribing to
 * any Page field" -- the documented example is `subscribed_fields=feed`,
 * which needs only `pages_manage_metadata` and the Page token.
 * Messenger fields (messages, messaging_postbacks, ...) must NOT be sent:
 * they are for Facebook Page DMs and require `pages_messaging`, which we
 * neither request nor need (Meta 403 / code 200, 2026-11-02).
 */
export const PAGE_SUBSCRIBED_FIELDS = ["feed"] as const;

// ------------------------------------------------------------ login mode

export type MetaLoginMode = "unified" | "facebook";

/** META_IG_LOGIN_MODE: "unified" switches back to Unified Login; anything else (incl. unset) is "facebook". */
export function parseLoginMode(value: string | undefined): MetaLoginMode {
  return value?.trim().toLowerCase() === "unified" ? "unified" : "facebook";
}

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

/**
 * Builds the Facebook Login dialog URL (Instagram API with Facebook Login).
 * Permissions come from the login configuration (config_id), not a scope
 * parameter.
 */
export function buildFacebookLoginUrl(input: {
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
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * Where a connection's Graph calls go: facebook-mode connections act on
 * their Facebook Page (send: POST /<PAGE_ID>/messages with the Page token,
 * unsubscribe: DELETE /<PAGE_ID>/subscribed_apps); unified-mode ones on the
 * Instagram account id. Null when the stored id is not a plain numeric id.
 */
export function instagramGraphNode(connection: {
  login_mode: MetaLoginMode;
  instagram_business_account_id: string;
  facebook_page_id: string | null;
}): string | null {
  const node = connection.login_mode === "facebook" ? connection.facebook_page_id : connection.instagram_business_account_id;
  return node && /^\d{1,32}$/.test(node) ? node : null;
}

// ------------------------------------------------------------ Meta callbacks

/** Connection columns a deauthorize / data-deletion signed_request user_id is matched against. */
export const META_CALLBACK_MATCH_COLUMNS = [
  "facebook_user_id",
  "meta_system_user_id",
  "client_business_id",
  "instagram_business_account_id",
  "facebook_page_id",
] as const;

/**
 * PostgREST `or` filter matching a verified Meta id against every id a
 * connection stores. Refuses anything but digits, so nothing a caller sends
 * can widen the filter.
 */
export function metaCallbackMatchFilter(metaUserId: string): string {
  if (!/^\d{1,32}$/.test(metaUserId)) throw new Error("meta user id must be digits");
  return META_CALLBACK_MATCH_COLUMNS.map((column) => `${column}.eq.${metaUserId}`).join(",");
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

export type GraphError = {
  code?: number;
  error_subcode?: number;
  type?: string;
  fbtrace_id?: string;
  /** Meta's developer message, sanitized (see sanitizeMetaText). Safe to log. */
  message?: string;
  /** Meta's user-facing message, sanitized. Safe to log; never shown to the client. */
  error_user_msg?: string;
};

const META_TEXT_MAX = 300;

/**
 * Meta's error.message / error.error_user_msg are plain text, not secrets,
 * but they come from outside: collapse whitespace, mask anything shaped
 * like an access token (EAA..., IGQ..., or any 40+ char token-ish run) and
 * cap the length before it reaches a log line.
 */
export function sanitizeMetaText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\b(?:EAA|IGQ|IGA)[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/[A-Za-z0-9_\-.]{40,}/g, "[redacted]")
    .trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.length > META_TEXT_MAX ? `${cleaned.slice(0, META_TEXT_MAX)}…` : cleaned;
}

/** Permission names we look for in Meta's error text (the first one named wins). */
const KNOWN_PERMISSIONS = [
  "pages_manage_metadata",
  "pages_messaging",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_manage_messages",
  "instagram_basic",
  "business_management",
] as const;

/**
 * The permission Meta's error text actually names, or null. Lets a log
 * reason say "missing_permission_<name>" only when Meta said so, instead of
 * guessing from the error code.
 */
export function permissionNamedInError(error: GraphError | null | undefined): string | null {
  const text = `${error?.message ?? ""} ${error?.error_user_msg ?? ""}`;
  return KNOWN_PERMISSIONS.find((name) => new RegExp(`\\b${name}\\b`).test(text)) ?? null;
}

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

/**
 * Graph "permission not granted" errors: code 200 (and the 200-299
 * permission range) or code 10 without the outside-window subcode. Which
 * permission is missing comes from Meta's text (permissionNamedInError),
 * not from the code.
 */
export function isPermissionError(error: GraphError | null | undefined): boolean {
  if (!error || typeof error.code !== "number") return false;
  if (error.code >= 200 && error.code <= 299) return true;
  return error.code === 10 && error.error_subcode !== 2534022;
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
  const { code, error_subcode, type, fbtrace_id, message, error_user_msg } = error as Record<string, unknown>;
  const safeMessage = sanitizeMetaText(message);
  const safeUserMessage = sanitizeMetaText(error_user_msg);
  return {
    code: typeof code === "number" ? code : undefined,
    error_subcode: typeof error_subcode === "number" ? error_subcode : undefined,
    type: typeof type === "string" ? type : undefined,
    ...(typeof fbtrace_id === "string" && /^[\w-]{1,64}$/.test(fbtrace_id) ? { fbtrace_id } : {}),
    ...(safeMessage ? { message: safeMessage } : {}),
    ...(safeUserMessage ? { error_user_msg: safeUserMessage } : {}),
  };
}
