"use server";

import { z } from "zod";
import { requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import type { ActionResult } from "@/lib/admin-tenant-actions";
import type { AnnouncementSeverity } from "@/lib/supabase/types";

/** Phase 33 Stop 5 (docs/phases.md): mutations for /apache's Support Tools announcements. Visible to every tenant it targets the moment it's created/activated, so support-role + step-up + audit, same posture as the jobs-retry/tenant-lifecycle actions in earlier stops. */

async function rateLimitOrFail(userId: string): Promise<string | null> {
  const allowed = await checkAdminMutationRateLimit(userId);
  if (!allowed) return "Too many admin actions in a short time. Wait a few minutes and try again.";
  return null;
}

const severitySchema = z.enum(["info", "warning", "critical"]);

const createAnnouncementSchema = z.object({
  message: z.string().trim().min(3).max(500),
  severity: severitySchema,
  targetBusinessIds: z.array(z.string().uuid()).nullable(),
});

export async function createAnnouncement(input: {
  message: string;
  severity: AnnouncementSeverity;
  targetBusinessIds: string[] | null;
}): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.targetBusinessIds !== null && parsed.data.targetBusinessIds.length === 0) {
    return { ok: false, error: "Select at least one tenant, or choose \"All tenants\"." };
  }

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("platform_announcements")
    .insert({
      message: parsed.data.message,
      severity: parsed.data.severity,
      target_type: parsed.data.targetBusinessIds === null ? "all" : "selected",
      target_business_ids: parsed.data.targetBusinessIds,
      created_by: admin.user_id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not create this announcement. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "announcement.created", "announcement", data.id, {
    after: { severity: parsed.data.severity, target_type: parsed.data.targetBusinessIds === null ? "all" : "selected" },
  });
  return { ok: true };
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("platform_announcements").select("active").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "This announcement no longer exists." };

  const { error } = await supabase
    .from("platform_announcements")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not update this announcement. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, active ? "announcement.activated" : "announcement.deactivated", "announcement", id, {
    before: { active: before.active },
    after: { active },
  });
  return { ok: true };
}

export async function deleteAnnouncement(id: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = z.string().trim().min(3).max(500).safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: "A reason is required." };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete this announcement. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "announcement.deleted", "announcement", id, { after: { reason: reasonCheck.data } });
  return { ok: true };
}
