import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listConversationsForBusiness } from "@/lib/conversations";
import { listLeadsForBusiness } from "@/lib/leads";

export default async function ConversationsPage() {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [conversations, leads] = await Promise.all([
    listConversationsForBusiness(supabase, businessId),
    listLeadsForBusiness(businessId),
  ]);

  const conversationIdsWithLead = new Set(leads.map((lead) => lead.conversation_id));

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Conversations</h1>

      <ul className="flex flex-col gap-3">
        {conversations.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
            No conversations yet.
          </li>
        ) : null}
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/dashboard/conversations/${conversation.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-dashboard-primary"
            >
              <div>
                <p className="font-medium text-zinc-900">
                  {new Date(conversation.created_at).toLocaleString()}
                </p>
                <p className="text-sm text-zinc-600">
                  {conversation.source ?? "—"} · {conversation.messageCount} message
                  {conversation.messageCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {conversation.needs_attention ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Needs attention
                  </span>
                ) : null}
                {conversationIdsWithLead.has(conversation.id) ? (
                  <span className="rounded-full bg-dashboard-primary/10 px-2.5 py-1 text-xs font-medium text-dashboard-primary">
                    Lead
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
