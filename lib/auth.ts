import "server-only";
import { auth } from "@clerk/nextjs/server";

export type AuthContext = {
  userId: string;
  orgId: string | undefined;
  orgSlug: string | undefined;
  orgRole: string | undefined;
};

/**
 * Protects the calling resource (Server Component, Route Handler, or
 * Server Action) via `auth.protect()` and returns the authenticated
 * identity. Clerk-level identity only — does not resolve `business_id`,
 * which requires the Supabase business/org link introduced in Phase 3/4.
 *
 * Accepts the same params as `auth.protect()` (e.g.
 * `{ role: "org:admin" }`) to additionally require an authorization
 * check, not just authentication.
 */
export async function requireAuthContext(
  options?: { role: "org:admin" },
): Promise<AuthContext> {
  const session = options ? await auth.protect(options) : await auth.protect();

  return {
    userId: session.userId,
    orgId: session.orgId,
    orgSlug: session.orgSlug,
    orgRole: session.orgRole,
  };
}

/**
 * Phase 24 role-based access. `org:admin` and `org:member` are Clerk's
 * built-in org roles (unchanged, still checked via `auth.protect({role})`
 * for the existing hard org:admin-only gates in app/(dashboard)/dashboard/profile/actions.ts).
 * `org:sales_agent` and `org:analyst_viewer` are custom roles the
 * business owner creates in the Clerk Dashboard (Organizations > Roles &
 * Permissions) -- Clerk's Backend API does not expose custom-role CRUD,
 * so this app cannot create them itself; it only ever reads whichever
 * role a session already carries.
 *
 * Clerk's own `has({ role })`/`auth.protect({ role })` check exact role
 * equality, not a hierarchy -- the ranking here is this app's own
 * authorization layer on top, not a Clerk concept. A member assigned a
 * role Clerk returns but this app doesn't recognize (e.g. a role slug
 * typo'd while setting up custom roles) ranks below every real tier
 * (-1), so it fails every `hasMinRole` check rather than silently
 * granting access -- unrecognized must never mean "trust it".
 */
export type AppRole = "org:admin" | "org:member" | "org:sales_agent" | "org:analyst_viewer";

const ROLE_RANK: Record<AppRole, number> = {
  "org:admin": 3,
  "org:member": 2,
  "org:sales_agent": 1,
  "org:analyst_viewer": 0,
};

export function hasMinRole(actualRole: string | undefined, minRole: AppRole): boolean {
  const actualRank = actualRole && actualRole in ROLE_RANK ? ROLE_RANK[actualRole as AppRole] : -1;
  return actualRank >= ROLE_RANK[minRole];
}

/** Returns a user-facing error message if `actualRole` doesn't meet `minRole`, or `null` if it does -- the common shape every Server Action in this app returns errors in. */
export function requireMinRole(actualRole: string | undefined, minRole: AppRole): string | null {
  if (hasMinRole(actualRole, minRole)) {
    return null;
  }
  return "You don't have permission to do this.";
}
