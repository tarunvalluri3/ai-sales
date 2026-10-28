"use server";

import { z } from "zod";
import { requirePlatformAdmin, requirePlatformAdminStepUp } from "@/lib/platform-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAuditLogEntry } from "@/lib/admin-audit-log";
import { checkAdminMutationRateLimit } from "@/lib/admin-rate-limit";
import { PLAN_KEYS, type PlanKey } from "@/lib/plans";

/**
 * Phase 33 Stop 2 (docs/phases.md): tenant lifecycle Server Actions. Every
 * one here, no exceptions: re-checks requirePlatformAdmin/StepUp itself
 * (never trusts the page having already checked), rate-limits on the
 * acting admin, writes a before/after audit row, and returns a plain
 * `{ ok: true } | { ok: false, error: string }` result -- never throws to
 * the client, matching this codebase's existing Server Action convention.
 *
 * "Send password reset" from the approved brief is deliberately NOT
 * implemented: Clerk's Backend API has no endpoint to trigger a reset
 * email on an admin's behalf (confirmed against the installed SDK's
 * UserApi types) -- the closest real capability is force logout /
 * session revocation, built in the Users section instead.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const reasonSchema = z.string().trim().min(3, "A reason is required.").max(500);

async function rateLimitOrFail(userId: string): Promise<string | null> {
  const allowed = await checkAdminMutationRateLimit(userId);
  if (!allowed) return "Too many admin actions in a short time. Wait a few minutes and try again.";
  return null;
}

export async function suspendTenant(businessId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("businesses").select("status, suspended_reason").eq("id", businessId).maybeSingle();

  const { error } = await supabase
    .from("businesses")
    .update({ status: "suspended", suspended_at: new Date().toISOString(), suspended_reason: reasonCheck.data })
    .eq("id", businessId);

  if (error) return { ok: false, error: "Could not suspend this tenant. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.suspended", "business", businessId, {
    businessId,
    before: before ?? undefined,
    after: { status: "suspended", suspended_reason: reasonCheck.data },
  });
  return { ok: true };
}

export async function reactivateTenant(businessId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("businesses").select("status, suspended_reason").eq("id", businessId).maybeSingle();

  const { error } = await supabase
    .from("businesses")
    .update({ status: "active", suspended_at: null, suspended_reason: null })
    .eq("id", businessId);

  if (error) return { ok: false, error: "Could not reactivate this tenant. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.reactivated", "business", businessId, {
    businessId,
    before: before ?? undefined,
    after: { status: "active", reason: reasonCheck.data },
  });
  return { ok: true };
}

const extendTrialSchema = z.object({
  days: z.number().int().positive().max(90),
  reason: reasonSchema,
});

export async function extendTenantTrial(businessId: string, input: { days: number; reason: string }): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const parsed = extendTrialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!subscription || subscription.status !== "trialing" || !subscription.trial_ends_at) {
    return { ok: false, error: "This tenant is not currently on a trial." };
  }

  const newTrialEnd = new Date(new Date(subscription.trial_ends_at).getTime() + parsed.data.days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("subscriptions").update({ trial_ends_at: newTrialEnd }).eq("business_id", businessId);
  if (error) return { ok: false, error: "Could not extend the trial. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.trial_extended", "business", businessId, {
    businessId,
    before: { trial_ends_at: subscription.trial_ends_at },
    after: { trial_ends_at: newTrialEnd, days_added: parsed.data.days, reason: parsed.data.reason },
  });
  return { ok: true };
}

const changePlanSchema = z.object({
  planKey: z.enum(PLAN_KEYS),
  reason: reasonSchema,
});

/** Owner-only (approved amendment 6: "Billing mutations (plan override, credit notes) are owner-only"). Directly sets subscriptions.plan_key -- NOT a Razorpay plan change (no charge/proration happens); this is a support override of the stored plan, same precedent as Phase 17b's own admin-free plan assignment at signup. */
export async function changeTenantPlan(businessId: string, input: { planKey: PlanKey; reason: string }): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("subscriptions").select("plan_key").eq("business_id", businessId).maybeSingle();

  if (!before) {
    return { ok: false, error: "This tenant has no subscription row yet (it is on the grandfathered default) -- a plan change needs a real row, which this action does not create. Use Razorpay checkout or create one directly first." };
  }

  const { error } = await supabase.from("subscriptions").update({ plan_key: parsed.data.planKey }).eq("business_id", businessId);
  if (error) return { ok: false, error: "Could not change this tenant's plan. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.plan_changed", "business", businessId, {
    businessId,
    before: { plan_key: before.plan_key },
    after: { plan_key: parsed.data.planKey, reason: parsed.data.reason },
  });
  return { ok: true };
}

const adjustLimitSchema = z.object({
  replyQuotaOverride: z.number().int().positive().nullable(),
  reason: reasonSchema,
});

export async function adjustTenantUsageLimit(
  businessId: string,
  input: { replyQuotaOverride: number | null; reason: string },
): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const parsed = adjustLimitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("subscriptions").select("reply_quota_override").eq("business_id", businessId).maybeSingle();

  if (!before) {
    return { ok: false, error: "This tenant has no subscription row yet -- there is nothing to override." };
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({ reply_quota_override: parsed.data.replyQuotaOverride })
    .eq("business_id", businessId);
  if (error) return { ok: false, error: "Could not adjust this tenant's usage limit. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.usage_limit_adjusted", "business", businessId, {
    businessId,
    before: { reply_quota_override: before.reply_quota_override },
    after: { reply_quota_override: parsed.data.replyQuotaOverride, reason: parsed.data.reason },
  });
  return { ok: true };
}

const integrationSchema = z.enum(["whatsapp", "instagram"]);

/** "Reset" = mark the connection errored/disconnected so the business must re-verify/re-auth it -- this app has no admin-side token refresh (tokens are the tenant's own, obtained via their own OAuth flow). Clears the stored last_error so the dashboard doesn't show a stale message after the tenant reconnects. */
export async function resetTenantIntegration(businessId: string, integration: "whatsapp" | "instagram", reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("support");
  const integrationCheck = integrationSchema.safeParse(integration);
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!integrationCheck.success) return { ok: false, error: "Unknown integration." };
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const table = integration === "whatsapp" ? "whatsapp_connections" : "instagram_connections";
  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from(table).select("status").eq("business_id", businessId).maybeSingle();

  if (!before) return { ok: false, error: `This tenant has no ${integration} connection to reset.` };

  const { error } = await supabase.from(table).update({ status: "disconnected", last_error: null }).eq("business_id", businessId);
  if (error) return { ok: false, error: "Could not reset this integration. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.integration_reset", integration, businessId, {
    businessId,
    before: { status: before.status },
    after: { status: "disconnected", reason: reasonCheck.data },
  });
  return { ok: true };
}

export async function softDeleteTenant(businessId: string, reason: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const reasonCheck = reasonSchema.safeParse(reason);
  if (!reasonCheck.success) return { ok: false, error: reasonCheck.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: before } = await supabase.from("businesses").select("deleted_at").eq("id", businessId).maybeSingle();
  if (before?.deleted_at) return { ok: false, error: "This tenant is already soft-deleted." };

  const { error } = await supabase
    .from("businesses")
    .update({ deleted_at: new Date().toISOString(), deletion_reason: reasonCheck.data })
    .eq("id", businessId);

  if (error) return { ok: false, error: "Could not delete this tenant. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.soft_deleted", "business", businessId, {
    businessId,
    after: { deletion_reason: reasonCheck.data },
  });
  return { ok: true };
}

const hardDeleteSchema = z.object({
  confirmName: z.string(),
  reason: reasonSchema,
});

/**
 * Owner-only, double-confirmed (the UI requires typing the exact business
 * name, checked again here -- never trust the client). A real DELETE FROM
 * businesses, which cascades via existing FKs to every business-owned
 * table EXCEPT invoices/credit_notes/invoice_holds, which deliberately
 * carry no FK on business_id (20261026000000) specifically so a GST tax
 * record survives this (approved amendment 5: "retain invoices, credit
 * notes and billing records for GST retention"). The audit row is written
 * BEFORE the delete, since admin_audit_log.business_id has no FK and does
 * not need the business row to exist.
 */
export async function hardDeleteTenant(businessId: string, input: { confirmName: string; reason: string }): Promise<ActionResult> {
  const { admin } = await requirePlatformAdminStepUp("owner");
  const parsed = hardDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, error: "Tenant not found." };
  if (parsed.data.confirmName !== business.name) {
    return { ok: false, error: "The typed name does not match this tenant's exact name." };
  }

  await recordAdminAuditLogEntry(admin.user_id, "tenant.hard_deleted", "business", businessId, {
    businessId,
    before: {
      name: business.name,
      clerk_org_id: business.clerk_org_id,
      contact_email: business.contact_email,
      contact_phone: business.contact_phone,
    },
    after: { reason: parsed.data.reason },
  });

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) return { ok: false, error: "Could not delete this tenant. Please try again. (It has already been audit-logged as attempted.)" };

  return { ok: true };
}

export async function addTenantNote(businessId: string, note: string): Promise<ActionResult> {
  const { admin } = await requirePlatformAdmin("support");
  const noteCheck = z.string().trim().min(1).max(2000).safeParse(note);
  if (!noteCheck.success) return { ok: false, error: "A note cannot be empty." };

  const rateLimitError = await rateLimitOrFail(admin.user_id);
  if (rateLimitError) return { ok: false, error: rateLimitError };

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("platform_admin_notes").insert({
    business_id: businessId,
    author_user_id: admin.user_id,
    note: noteCheck.data,
  });
  if (error) return { ok: false, error: "Could not save this note. Please try again." };

  await recordAdminAuditLogEntry(admin.user_id, "tenant.note_added", "business", businessId, { businessId });
  return { ok: true };
}
