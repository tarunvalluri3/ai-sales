"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import {
  listInternalNotificationsForBusiness,
  markAllInternalNotificationsRead,
  markInternalNotificationRead,
} from "@/lib/internal-notifications";
import { requireMinRole } from "@/lib/auth";
import { logAndGetUserMessage } from "@/lib/errors";
import type { InternalNotification } from "@/lib/supabase/types";

// The attention/bell poll moved to GET /api/dashboard/attention
// (lib/dashboard-poll.ts) so it never queues in front of a Server Action.

/** The bell's dropdown contents, fetched once per open rather than polled. */
export async function listNotificationsAction(): Promise<InternalNotification[]> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) return [];
  return listInternalNotificationsForBusiness(businessId);
}

export type NotificationReadState = { error?: string; success?: boolean };

/**
 * Deliberately no revalidatePath(): the badge is corrected by the next poll
 * tick (within a second), and revalidating here would re-run every query on
 * the current page on each click -- the exact production regression documented
 * in the conversations live-poll path.
 */
export async function markNotificationReadFromBellAction(id: string): Promise<NotificationReadState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) return { error: authError };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: "Invalid request." };

  try {
    await markInternalNotificationRead(businessId, parsed.data);
    return { success: true };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}

export async function markAllNotificationsReadAction(): Promise<NotificationReadState> {
  const { businessId, orgRole } = await requireBusinessContext();
  const authError = requireMinRole(orgRole, "org:analyst_viewer");
  if (authError) return { error: authError };

  try {
    await markAllInternalNotificationsRead(businessId);
    return { success: true };
  } catch (error) {
    return { error: logAndGetUserMessage(error) };
  }
}
