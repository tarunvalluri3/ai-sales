"use server";

import { z } from "zod";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";
import {
  countUnreadInternalNotifications,
  listInternalNotificationsForBusiness,
  markAllInternalNotificationsRead,
  markInternalNotificationRead,
} from "@/lib/internal-notifications";
import { requireMinRole } from "@/lib/auth";
import { logAndGetUserMessage } from "@/lib/errors";
import type { InternalNotification } from "@/lib/supabase/types";
import { logEvent } from "@/lib/logger";

/**
 * A handoff backlog this large means prospects are waiting on a human
 * reply with no one dismissing/taking over conversations -- worth an
 * alert, not just a badge number. Deliberately opportunistic, not a
 * true always-on monitor: this only fires while some business's
 * dashboard is actually open and polling (Phase 21's "alerting on ...
 * handoff backlog" scope, no background job queue exists yet -- see
 * docs/deployment.md/Phase 23). Sentry groups repeated identical
 * messages into one issue, so staying elevated across many 3-second
 * poll ticks does not produce a new alert per tick.
 */
const HANDOFF_BACKLOG_ALERT_THRESHOLD = 5;

/**
 * Polled directly from AttentionProvider (a plain async function call
 * from a client component, same pattern as pollConversationAction). No
 * Zod input to validate -- no arguments. Real failures propagate as a
 * rejected promise; the caller's poll loop treats a failure as "try
 * again next tick," not a value to guess (Phase 15c).
 */
export type DashboardPollSnapshot = {
  attentionCount: number;
  /** Drives the header bell's badge. Added 2026-10-21 to this existing tick rather than as a second poll loop. */
  unreadNotificationCount: number;
};

export async function pollAttentionCountAction(): Promise<DashboardPollSnapshot> {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  // Run as one round trip, so carrying the second number costs wall-clock time
  // only if the new COUNT is genuinely slower -- it is served by a partial
  // index, so it is not. Do NOT add a third query here without re-reviewing:
  // this is the hottest path in the app at one tick per second per open tab.
  const [attentionCount, unreadNotificationCount] = await Promise.all([
    countConversationsNeedingAttention(supabase, businessId),
    countUnreadInternalNotifications(businessId),
  ]);

  if (attentionCount >= HANDOFF_BACKLOG_ALERT_THRESHOLD) {
    logEvent("handoff_backlog_high", businessId, { count: attentionCount }, "error");
  }

  return { attentionCount, unreadNotificationCount };
}

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
