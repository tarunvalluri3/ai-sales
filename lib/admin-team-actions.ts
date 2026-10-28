"use server";

import { z } from "zod";
import { requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import { resolveClerkUserIdByEmail } from "@/lib/admin-team";
import type { ActionResult } from "@/lib/admin-tenant-actions";
import type { PlatformAdminRole } from "@/lib/supabase/types";

/**
 * Phase 33 Stop 5 (docs/phases.md), approved brief: "admin team management
 * (owner-role only -- add/remove platform_admins rows)". Every mutation
 * here is owner-only + step-up, same tier as hard-delete/plan-change in
 * Stop 2 -- adding or removing who can get into /apache at all is at
 * least as sensitive as any single tenant action.
 */

const roleSchema = z.enum(["owner", "support", "viewer"]);

async function rateLimitOrFail(userId: string): Promise<string | null> {
  const allowed = await checkAdminMutationRateLimit(userId);
  if (!allowed) return "Too many admin actions in a short time. Wait a few minutes and try again.";
  return null;
}

async function countOwners(supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<number> {
  const { count } = await supabase.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("role", "owner");
  return count ?? 0;
}

export async function addPlatformAdminByEmail(email: string, role: PlatformAdminRole): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const emailCheck = z.string().trim().email().safeParse(email);
  const roleCheck = roleSchema.safeParse(role);
  if (!emailCheck.success) return { ok: false, error: "Enter a valid email address." };
  if (!roleCheck.success) return { ok: false, error: "Unknown role." };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const userId = await resolveClerkUserIdByEmail(emailCheck.data);
  if (!userId) return { ok: false, error: "No Clerk user with this email was found. They must sign up/sign in at least once first." };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("platform_admins").insert({ user_id: userId, role: roleCheck.data });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This person is already a platform admin." };
    return { ok: false, error: "Could not add this admin. Please try again." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "admin_team.added", "platform_admin", userId, { after: { role: roleCheck.data, email: emailCheck.data } });
  return { ok: true };
}

export async function updatePlatformAdminRole(userId: string, role: PlatformAdminRole): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const roleCheck = roleSchema.safeParse(role);
  if (!roleCheck.success) return { ok: false, error: "Unknown role." };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle();
  if (!before) return { ok: false, error: "This admin no longer exists." };

  if (before.role === "owner" && roleCheck.data !== "owner" && (await countOwners(supabase)) <= 1) {
    return { ok: false, error: "This is the last owner -- promote another admin to owner first." };
  }

  const { error } = await supabase.from("platform_admins").update({ role: roleCheck.data }).eq("user_id", userId);
  if (error) return { ok: false, error: "Could not update this admin's role. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "admin_team.role_changed", "platform_admin", userId, {
    before: { role: before.role },
    after: { role: roleCheck.data },
  });
  return { ok: true };
}

export async function removePlatformAdmin(userId: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("platform_admins").select("role").eq("user_id", userId).maybeSingle();
  if (!before) return { ok: false, error: "This admin no longer exists." };

  if (before.role === "owner" && (await countOwners(supabase)) <= 1) {
    return { ok: false, error: "This is the last owner -- the panel must always keep at least one." };
  }

  const { error } = await supabase.from("platform_admins").delete().eq("user_id", userId);
  if (error) return { ok: false, error: "Could not remove this admin. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "admin_team.removed", "platform_admin", userId, { before: { role: before.role } });
  return { ok: true };
}
