import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InternalNotification } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

const LIST_LIMIT = 50;

/** Most recent internal notifications for a business, unread first. `businessId` must come from `requireBusinessContext()`. Not live-polled (deliberately, per this project's standing "no aggressive new polling" guidance) -- refreshes on normal page navigation only. */
export async function listInternalNotificationsForBusiness(businessId: string): Promise<InternalNotification[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("internal_notifications")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new AppError("Something went wrong loading notifications. Please try again.", "listInternalNotificationsForBusiness failed", error);
  }

  return data as InternalNotification[];
}

export async function markInternalNotificationRead(businessId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("internal_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong updating this notification. Please try again.", "markInternalNotificationRead failed", error);
  }

  return data.length > 0;
}
