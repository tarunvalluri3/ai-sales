import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PlatformAdmin, PlatformAdminRole } from "@/lib/supabase/types";
import {
  hasMinPlatformRole,
  hasFreshSecondFactor,
  SESSION_MFA_MAX_AGE_MINUTES,
  STEP_UP_MAX_AGE_MINUTES,
} from "@/lib/platform-admin-rules";

/**
 * Phase 33 (docs/phases.md): the /apache platform-admin access gate.
 *
 * Checked TWICE by design, per the approved security brief:
 *   1. proxy.ts, for every /apache/** request -- a coarse, edge-safe check
 *      (evaluatePlatformAdminAccess() below) that returns a bare 404
 *      before any page or layout even starts rendering.
 *   2. Every Server Component layout, Server Action and route handler
 *      under /apache, via requirePlatformAdmin()/requirePlatformAdminStepUp()
 *      -- because a Server Action can be invoked directly and must never
 *      rely on middleware alone (AGENTS.md §2/§3).
 *
 * Both checks are the SAME underlying logic (evaluatePlatformAdminAccess),
 * so there is exactly one place that decides "is this session a platform
 * admin" -- middleware and the app layer can never silently disagree. The
 * pure rules (role ranking, MFA freshness) live in lib/platform-admin-rules.ts
 * so they're unit-testable without a database or a real Clerk session.
 *
 * On ANY failure -- not signed in, not in platform_admins, role too low,
 * or MFA not fresh -- the result is a bare 404, never a 403 and never
 * Clerk's sign-in redirect. The route's existence must not be revealed to
 * a non-admin (the approved brief: "/apache is obscurity, not protection").
 */

export { hasMinPlatformRole, STEP_UP_MAX_AGE_MINUTES };

export type PlatformAdminContext = {
  userId: string;
  admin: PlatformAdmin;
};

/**
 * The single decision function both proxy.ts (edge, no notFound()/no
 * Supabase-session-cookie context) and the app-layer helpers below share.
 * Only this function touches the database -- everything else it depends on
 * is pure and lives in lib/platform-admin-rules.ts.
 */
export async function evaluatePlatformAdminAccess(
  userId: string | null | undefined,
  sessionClaims: { fva?: unknown } | null | undefined,
  minRole: PlatformAdminRole,
): Promise<PlatformAdminContext | null> {
  if (!userId) return null;
  if (!hasFreshSecondFactor(sessionClaims, SESSION_MFA_MAX_AGE_MINUTES)) return null;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("platform_admins")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const admin = data as PlatformAdmin;
  if (!hasMinPlatformRole(admin.role, minRole)) return null;

  return { userId, admin };
}

/**
 * App-layer guard for a Server Component, Server Action, or route handler.
 * 404s on any failure. Always re-checks against the database -- never
 * trusts a value cached from an earlier request in the same session.
 */
export async function requirePlatformAdmin(minRole: PlatformAdminRole = "viewer"): Promise<PlatformAdminContext> {
  const { userId, sessionClaims } = await auth();
  const ctx = await evaluatePlatformAdminAccess(userId, sessionClaims, minRole);
  if (!ctx) notFound();
  return ctx;
}

/**
 * Strict reverification before a destructive action (suspend/delete a
 * tenant, change a plan, issue a credit note, reveal masked PII, etc.).
 * Re-reads the CURRENT session's second-factor age against a much shorter
 * ceiling than the general /apache gate -- a session that was fresh when
 * the admin loaded the page an hour ago is not fresh enough to act now.
 */
export async function requirePlatformAdminStepUp(minRole: PlatformAdminRole = "owner"): Promise<PlatformAdminContext> {
  const ctx = await requirePlatformAdmin(minRole);
  const { sessionClaims } = await auth();
  if (!hasFreshSecondFactor(sessionClaims, STEP_UP_MAX_AGE_MINUTES)) notFound();
  return ctx;
}
