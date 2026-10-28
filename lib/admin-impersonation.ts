import "server-only";
import { cookies } from "next/headers";
import { isImpersonationExpired } from "@/lib/admin-impersonation-rules";

/**
 * Phase 33 Stop 5 (docs/phases.md): the read side of Support Tools'
 * time-boxed impersonation. There is NO new table and NO new identity or
 * access path here (AGENTS.md §3 rule 2 is untouched) -- this cookie is
 * purely a declared, time-boxed UI/audit construct. Every read an admin
 * can reach while "impersonating" (the existing /apache/tenants/[id] page
 * and everything else under /apache) is already gated by
 * requirePlatformAdmin()/StepUp() on its own, completely independent of
 * whether this cookie is present -- so even a tampered or forged cookie
 * value grants nothing. Its only job is to drive the persistent banner
 * (app/(dashboard)/apache/layout.tsx) and to tell
 * lib/admin-impersonation-actions.ts which business to log against when
 * the admin clicks "Exit". httpOnly/secure/sameSite are set anyway, as
 * good hygiene, not because anything security-relevant depends on them.
 */

export const IMPERSONATION_COOKIE_NAME = "apache_impersonation";

export type ImpersonationSession = {
  businessId: string;
  businessName: string;
  startedAt: string;
  expiresAt: string;
};

/** Returns the active session for the current request, or null if there is none or it has (by its own `expiresAt`) already lapsed. Does not delete a lapsed cookie itself -- the browser's own `maxAge` already does that; a Server Component cannot write cookies anyway. */
export async function getActiveImpersonationSession(): Promise<ImpersonationSession | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isImpersonationSession(parsed)) return null;
  if (isImpersonationExpired(parsed.expiresAt, new Date())) return null;

  return parsed;
}

function isImpersonationSession(value: unknown): value is ImpersonationSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.businessId === "string" && typeof v.businessName === "string" && typeof v.startedAt === "string" && typeof v.expiresAt === "string";
}
