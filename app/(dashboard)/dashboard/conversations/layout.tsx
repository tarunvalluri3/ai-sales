import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listConversationsForBusiness } from "@/lib/conversations";
import { listLeadsForBusiness } from "@/lib/leads";
import { listLastMessagesForConversations } from "@/lib/messages";
import { ChatListPane } from "./_components/chat-list-pane";

/**
 * Shared shell for the conversations inbox: wraps both
 * `/dashboard/conversations` (empty state) and
 * `/dashboard/conversations/[id]` (transcript + info panel) so the left
 * chat-list pane is fetched once and never remounts/re-fetches while
 * navigating between conversations -- Next.js only re-renders `page.tsx`
 * on a sibling-route navigation within the same layout segment.
 *
 * Neither this row nor `<main>` above it (`app/(dashboard)/dashboard/layout.tsx`,
 * untouched) needs a bounded/`overflow-hidden` height. `ChatListPane`
 * pins itself to the viewport via `sticky top-0 h-screen self-start` --
 * the exact same technique `Sidebar` already uses one level up in the
 * tree -- at every breakpoint (its own `hidden`/`flex` visibility toggle
 * is what keeps it off-screen on mobile at the `[id]` route, not a
 * height of 0). The `{children}` wrapper only needs that same treatment
 * from `md:` up, where it sits *beside* `ChatListPane`; on mobile the two
 * routes never render side by side (`page.tsx`'s own content is `hidden`
 * there, `ConversationPanes` pins itself the same way `ChatListPane`
 * does), so forcing this wrapper to `h-screen` unconditionally would
 * stack an empty extra viewport-height block beneath the chat list.
 * That's what makes the chat list and the transcript/info-panel column
 * feel like a fixed 3-pane app shell without touching the shared
 * dashboard layout, without any `calc()` arbitrary Tailwind value, and
 * without any JS scroll lock.
 */
export default async function ConversationsLayout({ children }: LayoutProps<"/dashboard/conversations">) {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversations = await listConversationsForBusiness(supabase, businessId);
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [leads, lastMessages] = await Promise.all([
    listLeadsForBusiness(businessId),
    listLastMessagesForConversations(supabase, businessId, conversationIds),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-ds-bg md:flex-row">
      <ChatListPane
        initialConversations={conversations}
        initialLeads={leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name }))}
        initialLastMessages={lastMessages}
      />
      <div className="flex min-w-0 flex-1 flex-col md:sticky md:top-0 md:h-screen md:self-start md:overflow-hidden">
        {children}
      </div>
    </div>
  );
}
