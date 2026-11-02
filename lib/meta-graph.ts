import "server-only";
import { decryptToken, encryptToken, parseEncryptionKey } from "@/lib/token-crypto";
import { parseLoginMode, readGraphError, type GraphError, type MetaLoginMode } from "@/lib/meta-instagram-rules";

/**
 * Server-only access to Meta's Graph API (graph.facebook.com) for the
 * Instagram integration: Instagram API with Facebook Login (Page tokens, the
 * default) or Instagram API with Unified Login (system user tokens,
 * META_IG_LOGIN_MODE=unified). Every value comes from env;
 * nothing here logs a token, the app secret or a response body.
 */

const DEFAULT_GRAPH_VERSION = "v26.0";
const REQUEST_TIMEOUT_MS = 10_000;

export type MetaConfig = {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
};

/** The full login config, or null when any piece is missing (the connect route then fails closed). */
export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const loginConfigId = process.env.META_LOGIN_CONFIG_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !loginConfigId || !redirectUri) return null;
  return { appId, appSecret, loginConfigId, redirectUri };
}

/** Which login new connections use. Existing connections keep the mode stored on their row. */
export function getMetaLoginMode(): MetaLoginMode {
  return parseLoginMode(process.env.META_IG_LOGIN_MODE);
}

export function graphBase(): string {
  const version = process.env.META_GRAPH_VERSION;
  return `https://graph.facebook.com/${version && /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION}`;
}

function requireKey(): Buffer {
  const key = parseEncryptionKey(process.env.META_TOKEN_ENCRYPTION_KEY);
  if (!key) throw new Error("META_TOKEN_ENCRYPTION_KEY is missing or not 32 bytes");
  return key;
}

export function hasTokenEncryptionKey(): boolean {
  return parseEncryptionKey(process.env.META_TOKEN_ENCRYPTION_KEY) !== null;
}

export function sealToken(token: string): string {
  return encryptToken(token, requireKey());
}

export function openToken(blob: string): string {
  return decryptToken(blob, requireKey());
}

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: GraphError | null };

/**
 * One Graph API call. The token goes in the Authorization header, never the
 * URL, so it cannot end up in a proxy or platform request log. Never throws
 * for an HTTP error; a network failure or timeout comes back as status 0.
 */
export async function graphRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { token?: string; query?: Record<string, string>; form?: Record<string, string>; json?: unknown } = {},
): Promise<GraphResult<T>> {
  const url = new URL(`${graphBase()}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, value);
  }

  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: string | URLSearchParams | undefined;
  if (options.form) {
    body = new URLSearchParams(options.form);
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      return { ok: false, status: response.status, error: readGraphError(parsed) };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, status: 0, error: null };
  } finally {
    clearTimeout(timeout);
  }
}
