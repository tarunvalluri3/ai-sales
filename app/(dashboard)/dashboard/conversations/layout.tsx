import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listConversationsForBusiness } from "@/lib/conversations";
import { listLeadsForBusiness } from "@/lib/leads";
import { listLastMessagesForConversations } from "@/lib/messages";
import { ChatListPane } from "./_components/chat-list-pane";

/**
 * Shared shell for the conversations inbox (2026-09-11 redesign): wraps
 * both `/dashboard/conversations` (empty state) and
 * `/dashboard/conversations/[id]` (transcript + info panel) so the left
 * chat-list pane is fetched once and never remounts/re-fetches while
 * navigating between conversations.
 *
 * Locked chat shell -- fourth and final attempt this session. The first
 * three (bare `sticky top-0 h-screen`; a `top` offset calc'd against
 * `SiteHeader`'s height; a `document.documentElement.style.overflow`
 * mutation) all failed, the last one badly -- its cleanup didn't
 * reliably run before the next route rendered, leaking `overflow: hidden`
 * onto completely unrelated pages, a real regression the user caught.
 * Root-caused properly this time: `app/(dashboard)/dashboard/layout.tsx`'s
 * `<main>` is now the dashboard's one bounded, `overflow-y-auto` scroll
 * container (a real, permanent structural fix, not a route-scoped hack) --
 * so this component needs nothing clever at all. `h-full` here resolves
 * correctly because its parent (`<main>`) finally has a *real* bounded
 * height, not one inherited as an unbounded percentage the way `body`
 * (`min-h-full`) always was. `overflow-hidden` on this row is what keeps
 * this page's own content from ever needing `<main>`'s scrollbar --
 * every pane below sizes itself to fill this row exactly and scrolls
 * internally instead.
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
    <div className="flex h-full flex-1 flex-row overflow-hidden bg-ds-bg">
      <ChatListPane
        initialConversations={conversations}
        initialLeads={leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name }))}
        initialLastMessages={lastMessages}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
