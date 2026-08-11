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
