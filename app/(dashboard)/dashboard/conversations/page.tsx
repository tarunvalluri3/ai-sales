import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listConversationsForBusiness } from "@/lib/conversations";
import { listLeadsForBusiness } from "@/lib/leads";
import { listLastMessagesForConversations } from "@/lib/messages";
import { ConversationsList } from "./_components/conversations-list";

export default async function ConversationsPage() {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversations = await listConversationsForBusiness(supabase, businessId);
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [leads, lastMessages] = await Promise.all([
    listLeadsForBusiness(businessId),
    listLastMessagesForConversations(supabase, businessId, conversationIds),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <ConversationsList
        initialConversations={conversations}
        initialLeads={leads.map((lead) => ({ conversationId: lead.conversation_id, contactName: lead.contact_name }))}
        initialLastMessages={lastMessages}
      />
    </div>
  );
}
