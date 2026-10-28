"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import { computeImpersonationExpiry } from "@/lib/admin-impersonation-rules";
import { IMPERSONATION_COOKIE_NAME, getActiveImpersonationSession, type ImpersonationSession } from "@/lib/admin-impersonation";
import type { ActionResult } from "@/lib/admin-tenant-actions";

/**
 * Phase 33 Stop 5 (docs/phases.md): starts/ends a time-boxed, read-only
 * "viewing as" session for Support Tools, audited both ways
 * (impersonation.started/ended). Starting requires a reason and a fresh
 * second factor (requirePlatformAdminStepUp) -- it is a declared,
 * deliberate decision to look at one tenant's data, same sensitivity
 * tier as a PII reveal. Ending is one click, no reason, any admin role
 * (requirePlatformAdmin) -- there is no reason to add friction to
 * stopping.
 */

const reasonSchema = z.string().trim().min(3, "A reason is required.").max(500);

export async function startImpersonation(businessId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  const supabase = createAdminSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, error: "Tenant not found." };

  const startedAt = new Date();
  const expiresAt = computeImpersonationExpiry(startedAt);
  const session: ImpersonationSession = {
    businessId: business.id,
    businessName: business.name,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const store = await cookies();
  store.set(IMPERSONATION_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/apache",
    maxAge: Math.round((expiresAt.getTime() - startedAt.getTime()) / 1000),
  });

  await recordAdminAuditLogEntry(admin.user_id, "impersonation.started", "business", businessId, {
    businessId,
    after: { reason: reasonCheck.data, expires_at: session.expiresAt },
  });

  redirect(`/apache/tenants/${businessId}`);
}

export async function endImpersonation(): Promise<ActionResult> {
  const { admin } = await requirePlatformAdmin("viewer");

  const active = await getActiveImpersonationSession();
  const store = await cookies();
  store.delete({ name: IMPERSONATION_COOKIE_NAME, path: "/apache" });

  if (active) {
    await recordAdminAuditLogEntry(admin.user_id, "impersonation.ended", "business", active.businessId, {
      businessId: active.businessId,
    });
  }
  return { ok: true };
}
