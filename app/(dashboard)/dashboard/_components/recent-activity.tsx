import Link from "next/link";
import type { Lead } from "@/lib/supabase/types";
import type { ConversationWithMessageCount } from "@/lib/conversations";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function RecentActivity({
  conversations,
  leads,
}: {
  conversations: ConversationWithMessageCount[];
  leads: Lead[];
}) {
  return (
    <section className="flex flex-col gap-5 rounded-ds-lg border border-ds-border bg-ds-surface p-5 lg:col-span-2">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium text-ds-text-primary">Recent conversations</h2>
            <Link
              href="/dashboard/conversations"
              className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              View all
            </Link>
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm text-ds-text-muted">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/conversations/${conversation.id}`}
                    className="flex items-center justify-between gap-3 rounded-ds-sm px-2 py-1.5 text-sm transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    <span className="truncate text-ds-text-secondary">
                      {conversation.source ?? "Chat widget"} · {conversation.messageCount} msg
                      {conversation.messageCount === 1 ? "" : "s"}
                    </span>
                    <span className="shrink-0 text-xs text-ds-text-muted">
                      {timeAgo(conversation.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium text-ds-text-primary">Recent leads</h2>
            <Link
              href="/dashboard/leads"
              className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              View all
            </Link>
          </div>
          {leads.length === 0 ? (
            <p className="text-sm text-ds-text-muted">No leads yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/dashboard/conversations/${lead.conversation_id}`}
                    className="flex items-center justify-between gap-3 rounded-ds-sm px-2 py-1.5 text-sm transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    <span className="truncate text-ds-text-secondary">
                      {lead.contact_name ?? "Unnamed prospect"}
                    </span>
                    <span className="shrink-0 text-xs text-ds-text-muted capitalize">
                      {lead.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
