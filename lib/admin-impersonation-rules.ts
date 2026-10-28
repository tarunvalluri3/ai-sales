/**
 * Phase 33 Stop 5 (docs/phases.md): pure logic behind Support Tools'
 * time-boxed impersonation -- the expiry window and the countdown math the
 * persistent banner renders -- kept separate from lib/admin-impersonation.ts
 * (the cookie-reading I/O layer) so it is unit-testable without Next's
 * request context, same split as lib/platform-admin-rules.ts.
 */

/** Hard ceiling, not configurable per-session: the approved brief's "30 min max". */
export const IMPERSONATION_MAX_MINUTES = 30;

export function computeImpersonationExpiry(startedAt: Date): Date {
  return new Date(startedAt.getTime() + IMPERSONATION_MAX_MINUTES * 60 * 1000);
}

export function isImpersonationExpired(expiresAt: string | Date, now: Date): boolean {
  return now.getTime() >= new Date(expiresAt).getTime();
}

/** Floored to the second, never negative -- the banner's countdown display. */
export function remainingImpersonationSeconds(expiresAt: string | Date, now: Date): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}
