import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getConversationForBusiness } from "@/lib/conversations";
import { listMessagesForConversation } from "@/lib/messages";
import { getLeadForConversation } from "@/lib/leads";
import { MessageBubble } from "../_components/message-bubble";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const conversation = await getConversationForBusiness(supabase, businessId, id);
  if (!conversation) {
    notFound();
  }

  const [messages, lead] = await Promise.all([
    listMessagesForConversation(supabase, businessId, conversation.id),
    getLeadForConversation(businessId, conversation.id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Conversation</h1>
        <p className="text-sm text-zinc-600">
          {new Date(conversation.created_at).toLocaleString()} · {conversation.source ?? "—"}
        </p>
      </div>

      <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-600">No messages yet.</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {lead ? (
        <div className="flex max-w-2xl flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-zinc-900">Lead</h2>
          <p className="font-medium text-zinc-900">{lead.contact_name ?? "Unnamed prospect"}</p>
          <p className="text-sm text-zinc-600">
            {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
          </p>
          <p className="text-sm text-zinc-600">
            Interest: {lead.interest_type ?? "—"}
            {lead.interest_id ? ` (matched: ${lead.interest_id})` : ""}
          </p>
          <p className="text-sm text-zinc-600">
            Qualification: {lead.qualification} — {lead.qualification_reason}
          </p>
          {lead.notes ? <p className="text-sm text-zinc-600">Notes: {lead.notes}</p> : null}
          <p className="text-xs text-zinc-500">Status: {lead.status}</p>
        </div>
      ) : null}
    </div>
  );
}
