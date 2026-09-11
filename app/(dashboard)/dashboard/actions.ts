"use server";

import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";
import { countPendingAppointmentsForBusiness } from "@/lib/appointments";
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

export type AttentionCounts = {
  conversationsNeedingAttention: number;
  pendingAppointments: number;
};

/**
 * Polled directly from AttentionProvider (a plain async function call
 * from a client component, same pattern as pollConversationAction). No
 * Zod input to validate -- no arguments. Real failures propagate as a
 * rejected promise; the caller's poll loop treats a failure as "try
 * again next tick," not a value to guess (Phase 15c).
 *
 * Returns both the Conversations "needs attention" count and the
 * Appointments "pending" count in one call (2026-09-11) -- one shared
 * 1-second poll backing both nav badges, rather than two independent
 * timers hitting the server every second.
 */
export async function pollAttentionCountAction(): Promise<AttentionCounts> {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [conversationsNeedingAttention, pendingAppointments] = await Promise.all([
    countConversationsNeedingAttention(supabase, businessId),
    countPendingAppointmentsForBusiness(supabase, businessId),
  ]);

  if (conversationsNeedingAttention >= HANDOFF_BACKLOG_ALERT_THRESHOLD) {
    logEvent("handoff_backlog_high", businessId, { count: conversationsNeedingAttention }, "error");
  }

  return { conversationsNeedingAttention, pendingAppointments };
}
