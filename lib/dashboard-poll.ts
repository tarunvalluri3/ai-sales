import "server-only";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention, getConversationForBusiness, listConversationsForBusiness } from "@/lib/conversations";
import { countUnreadInternalNotifications } from "@/lib/internal-notifications";
import { listLastMessagesForConversations, listMessagesForConversationAfter } from "@/lib/messages";
import { listLeadsForBusiness } from "@/lib/leads";
import { logEvent } from "@/lib/logger";
import type { ConversationListSnapshot } from "@/lib/dashboard-poll-client";
import type { ConversationControl, Message } from "@/lib/supabase/types";

/**
 * The dashboard polls (attention badge + bell, the conversations inbox list,
 * and one open conversation), read by the GET routes under app/api/dashboard/. They used
 * to be Server Actions, and Next.js dispatches Server Actions one at a time
 * per tab, so a poll in flight made every save and test-chat send wait
 * behind it (perf/reply-and-save-speed, STATE.md 2026-11-21). A GET route is
 * an ordinary fetch: it never queues behind, or in front of, an action.
 *
 * `businessId` must come from the caller's own session
 * (getBusinessContextForRoute), never from the request. Every read below is
 * tenant-scoped in the query itself and runs under the caller's Clerk-session
 * Supabase client (RLS), exactly as the old actions did.
 */

/**
 * A handoff backlog this large means prospects are waiting on a human
 * reply with no one dismissing/taking over conversations -- worth an
 * alert, not just a badge number. Opportunistic: it only fires while some
 * business's dashboard is open and polling. Sentry groups repeated identical
 * messages, so staying elevated across many ticks is one issue, not many.
 */
const HANDOFF_BACKLOG_ALERT_THRESHOLD = 5;

export type DashboardPollSnapshot = {
  attentionCount: number;
  /** Drives the header bell's badge. */
  unreadNotificationCount: number;
};

export async function loadAttentionSnapshot(businessId: string): Promise<DashboardPollSnapshot> {
  const supabase = createServerSupabaseClient();
  // One round trip: the second COUNT is served by a partial index. Do NOT add
  // a third query here without re-reviewing -- this is the hottest path in
  // the dashboard.
  const [attentionCount, unreadNotificationCount] = await Promise.all([
    countConversationsNeedingAttention(supabase, businessId),
    countUnreadInternalNotifications(businessId),
  ]);

  if (attentionCount >= HANDOFF_BACKLOG_ALERT_THRESHOLD) {
    logEvent("handoff_backlog_high", businessId, { count: attentionCount }, "error");
  }

  return { attentionCount, unreadNotificationCount };
}

/**
 * The conversations inbox's left rail: the most recent conversations, each
 * conversation's lead contact name, and one last-message preview per row
 * (one query across the listed conversations, not N+1). Same reads as the
 * former pollConversationsAction.
 */
export async function loadConversationList(businessId: string): Promise<ConversationListSnapshot> {
  const supabase = createServerSupabaseClient();
  const conversations = await listConversationsForBusiness(supabase, businessId);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const [leads, lastMessages] = await Promise.all([
    listLeadsForBusiness(businessId),
    listLastMessagesForConversations(supabase, businessId, conversationIds),
  ]);
  return {
    conversations,
    leads: leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name })),
    lastMessages,
  };
}

export type PollConversationResult = {
  messages: Message[];
  control: ConversationControl;
  needsAttention: boolean;
  asOf: string;
};

export const conversationPollSchema = z.object({
  conversationId: z.string().uuid(),
  after: z.iso.datetime({ offset: true }),
});

/**
 * New messages after `after` in one of the caller's own conversations.
 * Returns null for invalid input or a conversation that is not this
 * business's (indistinguishable, so another tenant's id reveals nothing).
 */
export async function loadConversationUpdates(
  businessId: string,
  input: { conversationId: unknown; after: unknown },
): Promise<PollConversationResult | null> {
  const parsed = conversationPollSchema.safeParse(input);
  if (!parsed.success) return null;

  const supabase = createServerSupabaseClient();
  const conversation = await getConversationForBusiness(supabase, businessId, parsed.data.conversationId);
  if (!conversation) return null;

  const messages = await listMessagesForConversationAfter(
    supabase,
    businessId,
    parsed.data.conversationId,
    parsed.data.after,
    { limit: 200 },
  );
  const asOf = messages.length > 0 ? messages[messages.length - 1].created_at : parsed.data.after;
  return { messages, control: conversation.control, needsAttention: conversation.needs_attention, asOf };
}
