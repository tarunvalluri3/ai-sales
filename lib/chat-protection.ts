/**
 * Public-chat protection (production readiness item 3, 2026-11-03): the
 * configurable per-IP / per-key / per-conversation / per-business rate limits,
 * the daily Gemini turn caps, and Cloudflare Turnstile. Pure (no server-only,
 * no I/O except the injected `fetch` in verifyTurnstileToken) so every branch
 * is unit-tested without a network or database (scripts/run-chat-protection-tests.mjs).
 *
 * Why Turnstile and not Vercel BotID: the app is moving to a VPS. Turnstile
 * renders INSIDE the widget iframe, which is our own page on our own domain
 * (app/(widget)/widget/embed), so the widget's allowed hostname is our app
 * domain -- not each customer's site. Cloudflare's docs do not state which
 * hostname is checked for a widget inside a cross-origin iframe, so run
 * TURNSTILE_MODE=log on a real customer page and confirm `hostname` in the
 * `turnstile_verified` log before switching to enforce.
 *
 * The existing Phase 32 abuse scopes (business_burst, new_conversation_ip,
 * ip_subnet) and the guardrail classifiers stay LOG-ONLY (owner decision
 * 2026-11-03); see docs/abuse-protection.md for how to switch them on.
 */

export const CHAT_RATE_LIMIT_WINDOW_SECONDS = 300;
export const DAY_SECONDS = 86_400;

export type TurnstileMode = "off" | "log" | "enforce";

export type ChatProtectionConfig = {
  /** Per visitor IP, per 5-minute window. Enforcing, fail-closed (unchanged). */
  ipLimit: number;
  /** Per widget key, per 5-minute window. Enforcing, fail-closed (unchanged). */
  keyLimit: number;
  /** Per conversation, per 5-minute window. Enforcing, fail-closed (unchanged). */
  conversationLimit: number;
  /** Per business across all its widget keys, per 5-minute window. Enforcing, fail-open. */
  businessLimit: number;
  /** AI turns per business per UTC day on the public chat. 0 = no cap. Enforcing, fail-open. */
  geminiDailyTurnsPerBusiness: number;
  /** AI turns per UTC day on the public chat across ALL businesses. 0 = no cap. Enforcing, fail-open. */
  geminiDailyTurnsGlobal: number;
  turnstile: {
    mode: TurnstileMode;
    /** Public site key (rendered in the widget iframe). */
    siteKey: string | null;
    secretKey: string | null;
    /** The hostname Turnstile should report (our app's), from NEXT_PUBLIC_APP_URL. Null = not checked. */
    expectedHostname: string | null;
  };
};

export const DEFAULT_CHAT_PROTECTION = {
  ipLimit: 30,
  keyLimit: 120,
  conversationLimit: 20,
  businessLimit: 300,
  geminiDailyTurnsPerBusiness: 1_000,
  geminiDailyTurnsGlobal: 20_000,
} as const;

function intFromEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  return value >= min && value <= max ? value : fallback;
}

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Reads the configuration. Malformed values fall back to the default (lib/env.ts
 * validates the same keys at startup, so a typo is still caught loudly there).
 * Turnstile needs BOTH keys; with either missing it is treated as `off` (and
 * the startup check warns), so a half-configured deploy never blocks chats.
 */
export function chatProtectionConfigFromEnv(env: Record<string, string | undefined> = process.env): ChatProtectionConfig {
  const rawMode = env.TURNSTILE_MODE?.trim();
  const requestedMode: TurnstileMode = rawMode === "log" || rawMode === "enforce" ? rawMode : "off";
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() || null;
  return {
    ipLimit: intFromEnv(env.CHAT_IP_LIMIT, DEFAULT_CHAT_PROTECTION.ipLimit, 1, 10_000),
    keyLimit: intFromEnv(env.CHAT_KEY_LIMIT, DEFAULT_CHAT_PROTECTION.keyLimit, 1, 100_000),
    conversationLimit: intFromEnv(env.CHAT_CONVERSATION_LIMIT, DEFAULT_CHAT_PROTECTION.conversationLimit, 1, 10_000),
    businessLimit: intFromEnv(env.CHAT_BUSINESS_LIMIT, DEFAULT_CHAT_PROTECTION.businessLimit, 1, 100_000),
    geminiDailyTurnsPerBusiness: intFromEnv(
      env.GEMINI_DAILY_TURN_CAP_PER_BUSINESS,
      DEFAULT_CHAT_PROTECTION.geminiDailyTurnsPerBusiness,
      0,
      10_000_000,
    ),
    geminiDailyTurnsGlobal: intFromEnv(
      env.GEMINI_DAILY_TURN_CAP_GLOBAL,
      DEFAULT_CHAT_PROTECTION.geminiDailyTurnsGlobal,
      0,
      100_000_000,
    ),
    turnstile: {
      mode: siteKey && secretKey ? requestedMode : "off",
      siteKey,
      secretKey,
      expectedHostname: hostnameOf(env.NEXT_PUBLIC_APP_URL),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Daily Gemini turn cap
 * ------------------------------------------------------------------ */

export type DailyCapVerdict = { allowed: true } | { allowed: false; which: "business" | "global" };

/**
 * `null` count = the counter read failed: the cap FAILS OPEN (a counter outage
 * must not silence every widget; the per-IP/key limits still apply and the
 * failure is logged by lib/rate-limit.ts). A cap of 0 means "no cap".
 */
export function dailyCapVerdict(
  counts: { business: number | null; global: number | null },
  config: Pick<ChatProtectionConfig, "geminiDailyTurnsPerBusiness" | "geminiDailyTurnsGlobal">,
): DailyCapVerdict {
  if (config.geminiDailyTurnsGlobal > 0 && counts.global !== null && counts.global > config.geminiDailyTurnsGlobal) {
    return { allowed: false, which: "global" };
  }
  if (
    config.geminiDailyTurnsPerBusiness > 0 &&
    counts.business !== null &&
    counts.business > config.geminiDailyTurnsPerBusiness
  ) {
    return { allowed: false, which: "business" };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ *
 * Turnstile
 * ------------------------------------------------------------------ */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare: tokens are at most 2048 characters. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

export type TurnstileResult =
  | { ok: true; hostname: string | null; action: string | null }
  | { ok: false; reason: "missing_token" | "invalid" | "hostname_mismatch" | "unavailable"; errorCodes: string[]; hostname: string | null };

/**
 * Server-side validation against Cloudflare's siteverify endpoint (POST, form
 * body: secret, response, remoteip). A token is single-use and valid for 300 s.
 * Never throws: a network error or a non-JSON answer is `unavailable`.
 */
export async function verifyTurnstileToken(params: {
  token: string | undefined;
  secretKey: string;
  remoteIp: string | null;
  expectedHostname: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TurnstileResult> {
  if (!params.token) return { ok: false, reason: "missing_token", errorCodes: [], hostname: null };
  const form = new URLSearchParams({ secret: params.secretKey, response: params.token });
  if (params.remoteIp && params.remoteIp !== "unknown") form.set("remoteip", params.remoteIp);
  try {
    const response = await (params.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(params.timeoutMs ?? 3_000),
    });
    const data = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
      "error-codes"?: unknown;
    };
    const hostname = typeof data.hostname === "string" ? data.hostname : null;
    const errorCodes = Array.isArray(data["error-codes"])
      ? data["error-codes"].filter((code): code is string => typeof code === "string").slice(0, 5)
      : [];
    if (data.success !== true) {
      // internal-error is Cloudflare's own failure, not the visitor's.
      return { ok: false, reason: errorCodes.includes("internal-error") ? "unavailable" : "invalid", errorCodes, hostname };
    }
    if (params.expectedHostname && hostname && hostname !== params.expectedHostname) {
      return { ok: false, reason: "hostname_mismatch", errorCodes, hostname };
    }
    return { ok: true, hostname, action: typeof data.action === "string" ? data.action : null };
  } catch {
    return { ok: false, reason: "unavailable", errorCodes: [], hostname: null };
  }
}

/**
 * What the chat route does with a Turnstile result.
 * - off: never checked.
 * - log: always allowed; the result is only logged.
 * - enforce: a missing, invalid or wrong-hostname token is refused. Cloudflare
 *   being UNAVAILABLE is allowed (fail-open, logged): a Cloudflare outage must
 *   not take every customer's widget down; the rate limits still apply.
 */
export function turnstileDecision(mode: TurnstileMode, result: TurnstileResult | null): "allow" | "reject" {
  if (mode !== "enforce" || result === null || result.ok) return "allow";
  return result.reason === "unavailable" ? "allow" : "reject";
}
