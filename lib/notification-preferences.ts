import "server-only";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { NotificationCategory, NotificationEmailMode, NotificationPreference } from "@/lib/supabase/types";

/**
 * Per-business notification routing (migration 20261022000000).
 *
 * The categories a business can configure. `workflow` is deliberately absent:
 * the workflow engine's `email_notification` action is authored by the owner
 * inside a specific workflow, so a global toggle silently disabling a step
 * they built themselves would be worse than the noise it saved.
 */
export const NOTIFICATION_CATEGORIES = [
  "human_handover",
  "appointment_request",
  "appointment_status",
  "lead_created",
  "sla_breach",
  "assignment",
] as const;

export type ResolvedNotificationPreference = {
  category: NotificationCategory;
  emailMode: NotificationEmailMode;
  inAppEnabled: boolean;
};

/**
 * What a business gets before it ever opens the settings page -- which is
 * every business today, since nothing is seeded and no row is created at
 * onboarding. Absence of a row means exactly this, so the defaults ARE the
 * product's behaviour, not a fallback nobody hits.
 *
 * The tiering rule: an immediate email only where a human must act soon and
 * may not be looking at the dashboard. Everything else stays in-app and is
 * rolled up by the daily digest. Emailing every event instead would train
 * people to filter the whole sender, taking the urgent ones down with it.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationCategory, ResolvedNotificationPreference> = {
  // A prospect is waiting on a person right now.
  human_handover: { category: "human_handover", emailMode: "immediate", inAppEnabled: true },
  // A prospect booked a time that only the business can confirm.
  appointment_request: { category: "appointment_request", emailMode: "immediate", inAppEnabled: true },
  // A receipt for an action a human just clicked -- inherently one per click.
  appointment_status: { category: "appointment_status", emailMode: "immediate", inAppEnabled: true },
  // Real, but not urgent: the lead is captured and visible on the leads page.
  lead_created: { category: "lead_created", emailMode: "digest", inAppEnabled: true },
  // Cron-driven, so already late by definition; opt-in to immediate instead.
  sla_breach: { category: "sla_breach", emailMode: "digest", inAppEnabled: true },
  // Nothing writes this yet -- there is no per-assignee address plumbed, so an
  // email would reach the wrong person. In-app only until that exists.
  assignment: { category: "assignment", emailMode: "off", inAppEnabled: true },
  // `workflow` is not configurable, but the map must be total over the column's
  // check constraint so lookups never return undefined.
  workflow: { category: "workflow", emailMode: "immediate", inAppEnabled: true },
};

/**
 * Client injection, matching lib/notifications.ts's own convention: the caller
 * already holds either the service-role client (widget/cron paths) or the
 * Clerk-session one (dashboard). Both satisfy the RLS policies, because
 * business_id is always the caller's own.
 */
type AnySupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * One business's full preference set, every category present, stored rows
 * merged over the defaults. Used by the settings page so the form always
 * renders a complete table regardless of how many rows exist.
 */
export async function listNotificationPreferences(
  supabase: AnySupabaseClient,
  businessId: string,
): Promise<ResolvedNotificationPreference[]> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, email_mode, in_app_enabled")
    .eq("business_id", businessId);

  if (error) {
    throw new AppError("Something went wrong loading your notification settings. Please try again.", "listNotificationPreferences failed", error);
  }

  const stored = new Map((data as Pick<NotificationPreference, "category" | "email_mode" | "in_app_enabled">[]).map((row) => [row.category, row]));

  return NOTIFICATION_CATEGORIES.map((category) => {
    const row = stored.get(category);
    if (!row) return DEFAULT_NOTIFICATION_PREFERENCES[category];
    return { category, emailMode: row.email_mode, inAppEnabled: row.in_app_enabled };
  });
}

/**
 * The single preference the dispatcher needs, resolved against the defaults.
 *
 * **Fails open toward notifying.** A transient query error returns the default
 * rather than silently dropping the notification -- a missed handover alert is
 * the exact bug this whole feature exists to fix, so the safe direction here is
 * to over-notify, not under-notify.
 */
export async function getNotificationPreference(
  supabase: AnySupabaseClient,
  businessId: string,
  category: NotificationCategory,
): Promise<ResolvedNotificationPreference> {
  const fallback = DEFAULT_NOTIFICATION_PREFERENCES[category];

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, email_mode, in_app_enabled")
    .eq("business_id", businessId)
    .eq("category", category)
    .maybeSingle();

  if (error) {
    logEvent("notification_preference_lookup_failed", businessId, { category }, "error");
    return fallback;
  }

  if (!data) return fallback;

  return { category, emailMode: data.email_mode, inAppEnabled: data.in_app_enabled };
}

/** Writes the whole set in one statement. Admin-only at the action layer. */
export async function upsertNotificationPreferences(
  supabase: AnySupabaseClient,
  businessId: string,
  preferences: ResolvedNotificationPreference[],
): Promise<void> {
  const now = new Date().toISOString();
  const rows = preferences.map((preference) => ({
    business_id: businessId,
    category: preference.category,
    email_mode: preference.emailMode,
    in_app_enabled: preference.inAppEnabled,
    updated_at: now,
  }));

  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "business_id,category" });

  if (error) {
    throw new AppError("Something went wrong saving your notification settings. Please try again.", "upsertNotificationPreferences failed", error);
  }
}
