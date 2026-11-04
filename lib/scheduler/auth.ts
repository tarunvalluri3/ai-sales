import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The scheduler trigger's authentication (production readiness, item 3).
 * `Authorization: Bearer $CRON_SECRET` -- the convention Vercel Cron already
 * uses, so the same secret works for Vercel and for a VPS crontab calling
 * with curl. Constant-time (both sides hashed to equal length first), and
 * FAILS CLOSED: no secret configured, or one shorter than 16 characters,
 * means no request is ever accepted.
 *
 * Pure (no server-only import) so the unit tests can import it.
 */
export const MIN_CRON_SECRET_LENGTH = 16;

export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return false;
  const provided = createHash("sha256").update(authorizationHeader.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(provided, expected);
}

/** `?jobs=a,b` -> ["a","b"], keeping only known job names. Unknown names are reported, not run. */
export function parseJobFilter(raw: string | null, knownJobs: readonly string[]): { only: string[]; unknown: string[] } {
  if (!raw) return { only: [], unknown: [] };
  const requested = [...new Set(raw.split(",").map((name) => name.trim()).filter(Boolean))];
  const known = new Set(knownJobs);
  return {
    only: requested.filter((name) => known.has(name)),
    unknown: requested.filter((name) => !known.has(name)),
  };
}
