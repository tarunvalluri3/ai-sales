/**
 * Phase 33 (docs/phases.md): the pure, network-free decision rules behind
 * the /apache platform-admin gate -- role ranking and the MFA-freshness
 * check. Deliberately NOT "server-only" and free of any Clerk/Next/
 * Supabase import, same reason lib/copilot-lifecycle.ts and
 * lib/abuse-limits.ts are: scripts/run-platform-admin-rules-tests.mjs
 * imports this module directly through the @/* alias resolver and
 * exercises every branch with no database and no real Clerk session.
 * lib/platform-admin.ts (server-only) is the only caller in the real app.
 */
import type { PlatformAdminRole } from "@/lib/supabase/types";

const ROLE_RANK: Record<PlatformAdminRole, number> = {
  owner: 2,
  support: 1,
  viewer: 0,
};

export function hasMinPlatformRole(role: PlatformAdminRole, minRole: PlatformAdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** A general /apache session must have completed a second factor within the last hour. */
export const SESSION_MFA_MAX_AGE_MINUTES = 60;
/** A destructive action requires a second factor completed within the last 5 minutes -- strict reverification, re-checked at the moment of the action, not cached from page load. */
export const STEP_UP_MAX_AGE_MINUTES = 5;

/**
 * "fva" (factor verification age, Clerk's own experimental session claim):
 * [firstFactorAgeMinutes, secondFactorAgeMinutes] since each was last
 * verified in THIS session. -1 means that factor was never verified in
 * this session at all. There is no Supabase-style AAL2 concept here --
 * Clerk's session claims are the only signal this app has, and this is
 * read directly off the session JWT rather than relying on `auth.protect`'s
 * `reverification` option, which this installed Clerk version's types do
 * not expose (see STATE.md's Phase 33 entry for why).
 */
export function secondFactorAgeMinutes(sessionClaims: { fva?: unknown } | null | undefined): number | null {
  const fva = sessionClaims?.fva;
  if (!Array.isArray(fva) || typeof fva[1] !== "number") return null;
  return fva[1];
}

export function hasFreshSecondFactor(sessionClaims: { fva?: unknown } | null | undefined, maxAgeMinutes: number): boolean {
  const age = secondFactorAgeMinutes(sessionClaims);
  return age !== null && age >= 0 && age <= maxAgeMinutes;
}
