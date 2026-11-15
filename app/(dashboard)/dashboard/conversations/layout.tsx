import { requireLiveBusinessContext } from "@/lib/business-context";
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
 * The workspace as a whole pins itself to the viewport (`sticky top-0
 * h-screen`, the same technique `Sidebar` uses one level up), so `<main>`
 * above it needs no bounded height: the panes (chat list, transcript,
 * prospect context) sit edge to edge, full width, each scrolling internally,
 * like the deployed inbox. The list pane carries the page's h1. Below `md:` only one card shows at
 * a time: `ChatListPane` hides itself on the `[id]` route and the index
 * page renders nothing visible, so the two never sit side by side there.
 */
export default async function ConversationsLayout({ children }: LayoutProps<"/dashboard/conversations">) {
  const { businessId } = await requireLiveBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversations = await listConversationsForBusiness(supabase, businessId);
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [leads, lastMessages] = await Promise.all([
    listLeadsForBusiness(businessId),
    listLastMessagesForConversations(supabase, businessId, conversationIds),
  ]);

  return (
    <div className="dashboard-conversation-workspace sticky top-0 flex h-screen w-full overflow-hidden border-t border-ds-border">
      <ChatListPane
        initialConversations={conversations}
        initialLeads={leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name }))}
        initialLastMessages={lastMessages}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
