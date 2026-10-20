"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusinessContext } from "@/lib/business-context";
import { requireAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NOTIFICATION_CATEGORIES, upsertNotificationPreferences } from "@/lib/notification-preferences";
import { recordAuditLogEntry } from "@/lib/audit-log";
import { logAndGetUserMessage } from "@/lib/errors";

export type NotificationPreferencesState = { error?: string; success?: boolean };

const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: z.enum(NOTIFICATION_CATEGORIES),
        emailMode: z.enum(["immediate", "digest", "off"]),
        inAppEnabled: z.boolean(),
      }),
    )
    .length(NOTIFICATION_CATEGORIES.length),
});

/**
 * Settings are admin-only, matching /dashboard/profile's own
 * `requireAuthContext({ role: "org:admin" })` rather than the `requireMinRole`
 * tiering used for day-to-day mutations -- notification routing decides what
 * the whole team does and doesn't hear about.
 */
export async function saveNotificationPreferencesAction(
  _prevState: NotificationPreferencesState,
  formData: FormData,
): Promise<NotificationPreferencesState> {
  await requireAuthContext({ role: "org:admin" });
  const { businessId, userId } = await requireBusinessContext();

  const parsed = preferencesSchema.safeParse({
    preferences: NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      emailMode: formData.get(`email_mode_${category}`),
      inAppEnabled: formData.get(`in_app_${category}`) === "on",
    })),
  });

  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  try {
    const supabase = createServerSupabaseClient();
    await upsertNotificationPreferences(supabase, businessId, parsed.data.preferences);
    await recordAuditLogEntry(businessId, userId, "notification_preferences.updated", "business", businessId);
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }

  revalidatePath("/dashboard/notifications");
  return { success: true };
}
