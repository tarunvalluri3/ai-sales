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
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Conversations</h1>
        <p className="text-sm text-ds-text-secondary">
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"} total
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-ds-lg border border-dashed border-ds-border px-4 py-14 text-center">
          <p className="text-sm font-medium text-ds-text-primary">No conversations yet</p>
          <p className="max-w-sm text-xs text-ds-text-muted">
            Conversations started from your chat widget will appear here, with prospect and AI messages
            in real time.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/dashboard/conversations/${conversation.id}`}
                className="group flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3.5 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate text-sm font-medium text-ds-text-primary">
                    {conversation.source ?? "Chat widget"}
                  </p>
                  <p className="text-xs text-ds-text-muted">
                    {new Date(conversation.created_at).toLocaleString()} · {conversation.messageCount}{" "}
                    message
                    {conversation.messageCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {conversation.needs_attention ? (
                    <span className="rounded-ds-sm bg-ds-warning-bg px-2.5 py-1 text-2xs font-semibold tracking-wide-ds text-ds-warning uppercase">
                      Needs attention
                    </span>
                  ) : null}
                  {conversation.control === "human" ? (
                    <span className="rounded-ds-sm bg-ds-surface-soft px-2.5 py-1 text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">
                      Human-controlled
                    </span>
                  ) : null}
                  {conversationIdsWithLead.has(conversation.id) ? (
                    <span className="rounded-ds-sm bg-ds-accent-soft-bg px-2.5 py-1 text-2xs font-semibold tracking-wide-ds text-ds-accent-muted uppercase">
                      Lead
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
