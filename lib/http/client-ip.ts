/**
 * Which header carries the real client IP (production readiness, item 9;
 * LAUNCH_AUDIT.md §8 and §15). Pure, no server-only import.
 *
 * On Vercel, the platform overwrites `x-forwarded-for`, so its FIRST entry is
 * the client. Behind nginx with the default
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, the first
 * entry is whatever the client sent (spoofable -- every per-IP rate limit
 * could be bypassed) and only the LAST entry, appended by nginx itself, is
 * trustworthy. CLIENT_IP_SOURCE picks:
 *   xff-first  (default; Vercel)
 *   xff-last   (one trusted reverse proxy that appends, e.g. nginx defaults)
 *   x-real-ip  (nginx `proxy_set_header X-Real-IP $remote_addr`)
 */

export type ClientIpSource = "xff-first" | "xff-last" | "x-real-ip";

export function parseClientIpSource(raw: string | undefined): ClientIpSource {
  return raw === "xff-last" || raw === "x-real-ip" ? raw : "xff-first";
}

export function clientIpFromHeaders(getHeader: (name: string) => string | null, source: ClientIpSource): string {
  if (source === "x-real-ip") {
    return getHeader("x-real-ip")?.trim() || "unknown";
  }
  const entries = (getHeader("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return "unknown";
  return (source === "xff-last" ? entries[entries.length - 1] : entries[0]) ?? "unknown";
}
