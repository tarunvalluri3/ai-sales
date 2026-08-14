import "server-only";
import { NextRequest } from "next/server";

/**
 * Shared CORS/origin/IP helpers for the public widget endpoints
 * (app/api/chat/route.ts, app/api/chat/poll/route.ts). CORS here is a
 * browser-compatibility concern, not the security boundary -- the real
 * per-business origin check happens server-side in
 * lib/widget-auth.ts's resolveBusinessFromWidgetKey(), which runs
 * regardless of these headers.
 */

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function extractOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Trusts `x-forwarded-for` as set by the deployment platform's own edge
 * (Vercel, the named deployment target -- AGENTS.md §2), which sets/
 * overwrites this header itself and is not spoofable end-to-end there.
 * This is only a trustworthy rate-limiting signal in that environment --
 * if this app is ever self-hosted or run behind a different/untrusted
 * reverse proxy (or no proxy at all), this header becomes attacker-
 * controllable and this function's IP-scope rate limiting would no
 * longer be meaningful without re-checking this assumption first
 * (Phase 19b, docs/phase-19-audit-findings.md §6).
 */
export function extractIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}
