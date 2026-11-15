import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, MessageSquare, Users } from "lucide-react";
import type { Lead } from "@/lib/supabase/types";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import { channelLabel } from "@/lib/conversation-channel";
import { InlineEmptyState } from "./state-views";
import { Avatar, Card, Pill, linkAccent, type PillTone } from "./ui";
import { anonymousContactLabel, displayContactName, leadSourceLabel } from "@/lib/lead-source";

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

const STATUS_TONE: Record<Lead["status"], PillTone> = {
  new: "lime",
  contacted: "gray",
  converted: "solid",
  lost: "gray",
};

const ROW =
  "flex items-center gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";

function Column({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-ds-text-primary">{title}</h3>
        <Link href={href} className={linkAccent}>
          View all
          <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </div>
  );
}

/**
 * Two side-by-side lists: the latest conversations and the latest leads.
 * A conversation has no name of its own, so the prospect name comes from the
 * lead captured in that conversation (when there is one); otherwise the row
 * is labelled by channel, exactly like the Conversations inbox.
 */
export function RecentActivity({
  conversations,
  leads,
  nameByConversationId,
}: {
  conversations: ConversationWithMessageCount[];
  leads: Lead[];
  nameByConversationId: Record<string, string>;
}) {
  return (
    <Card className="flex flex-col gap-4 lg:col-span-2">
      <h2 className="dx-title">Recent activity</h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 sm:divide-x sm:divide-ds-border">
        <Column title="Recent conversations" href="/dashboard/conversations">
          {conversations.length === 0 ? (
            <InlineEmptyState icon={MessageSquare} label="No conversations yet." />
          ) : (
            <ul className="dx-rows flex flex-col">
              {conversations.map((conversation) => {
                const name = displayContactName(nameByConversationId[conversation.id]);
                const channel = channelLabel(conversation.source);
                return (
                  <li key={conversation.id}>
                    <Link href={`/dashboard/conversations/${conversation.id}`} className={ROW}>
                      <Avatar name={name} source={conversation.source} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-ds-text-primary">{name ?? anonymousContactLabel(conversation.source)}</span>
                        <span className="truncate text-xs text-ds-text-secondary">
                          {channel} · {conversation.messageCount} msg{conversation.messageCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ds-text-secondary">{timeAgo(conversation.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Column>

        <div className="sm:pl-8">
          <Column title="Recent leads" href="/dashboard/leads">
            {leads.length === 0 ? (
              <InlineEmptyState icon={Users} label="No leads yet." />
            ) : (
              <ul className="dx-rows flex flex-col">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/dashboard/conversations/${lead.conversation_id}`} className={ROW}>
                      <Avatar name={lead.contact_name} source={lead.source} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-ds-text-primary">
                          {displayContactName(lead.contact_name) ?? "Unnamed prospect"}
                        </span>
                        <span className="truncate text-xs text-ds-text-secondary">
                          {leadSourceLabel(lead.source)} · {timeAgo(lead.created_at)}
                        </span>
                      </span>
                      <Pill tone={STATUS_TONE[lead.status]} size="sm" className="capitalize">
                        {lead.status}
                      </Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Column>
        </div>
      </div>
    </Card>
  );
}
