import "server-only";
import { auth } from "@clerk/nextjs/server";

export type AuthContext = {
  userId: string;
  orgId: string | undefined;
  orgSlug: string | undefined;
  orgRole: string | undefined;
};

/**
 * Clerk-level identity only. Does not resolve `business_id` — that
 * requires the Supabase business/org link introduced in Phase 3/4.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();

  if (!session.isAuthenticated) return null;

  return {
    userId: session.userId,
    orgId: session.orgId,
    orgSlug: session.orgSlug,
    orgRole: session.orgRole,
  };
}
