import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InternalNotification } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

const LIST_LIMIT = 50;

/** Most recent internal notifications for a business, newest first. `businessId` must come from `requireBusinessContext()`. Deliberately not live-polled: the header bell fetches this once each time its dropdown opens, and only the unread COUNT rides the 1-second dashboard poll. */
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

/**
 * Unread count for the header bell's badge. Ridden by the existing 1-second
 * dashboard poll, which is why only the COUNT is live and the 50-row list is
 * not -- polling the list every second is exactly the aggressive polling this
 * project avoids. Served by the partial index
 * internal_notifications_unread_idx (business_id) where read_at is null.
 */
export async function countUnreadInternalNotifications(businessId: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .is("read_at", null);

  if (error) {
    throw new AppError("Something went wrong loading notifications. Please try again.", "countUnreadInternalNotifications failed", error);
  }

  return count ?? 0;
}

/** Marks every unread notification read. Needs no migration: the existing column-scoped `update (read_at)` grant and the update policy from 20260914060000 already permit exactly this. Returns how many rows changed. */
export async function markAllInternalNotificationsRead(businessId: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("internal_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .is("read_at", null)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong updating your notifications. Please try again.", "markAllInternalNotificationsRead failed", error);
  }

  return data.length;
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
