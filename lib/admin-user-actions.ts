"use server";

import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import type { ActionResult } from "@/lib/admin-tenant-actions";

/** Phase 33 Stop 2 (docs/phases.md): cross-tenant user actions via Clerk's Backend API -- same audit/rate-limit/step-up contract as lib/admin-tenant-actions.ts. */

const reasonSchema = z.string().trim().min(3, "A reason is required.").max(500);

export async function disableUser(userId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  try {
    const clerk = await clerkClient();
    await clerk.users.banUser(userId);
  } catch {
    return { ok: false, error: "Could not disable this user. Please try again." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "user.disabled", "user", userId, { after: { reason: reasonCheck.data } });
  return { ok: true };
}

export async function enableUser(userId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  try {
    const clerk = await clerkClient();
    await clerk.users.unbanUser(userId);
  } catch {
    return { ok: false, error: "Could not re-enable this user. Please try again." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "user.enabled", "user", userId, { after: { reason: reasonCheck.data } });
  return { ok: true };
}

export async function forceLogoutUser(userId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const allowed = await checkAdminMutationRateLimit(admin.user_id);
  if (!allowed) return { ok: false, error: "Too many admin actions in a short time. Wait a few minutes and try again." };

  try {
    const clerk = await clerkClient();
    const sessions = await clerk.sessions.getSessionList({ userId, status: "active" });
    await Promise.all(sessions.data.map((session) => clerk.sessions.revokeSession(session.id)));
  } catch {
    return { ok: false, error: "Could not revoke this user's sessions. Please try again." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "user.force_logout", "user", userId, { after: { reason: reasonCheck.data } });
  return { ok: true };
}
