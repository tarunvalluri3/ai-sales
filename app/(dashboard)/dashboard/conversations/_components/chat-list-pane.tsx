"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pollConversationsAction, type ConversationLeadSummary } from "../actions";
import { MESSAGE_ROLE_LABEL } from "./message-bubble";
import { channelLabel } from "@/lib/conversation-channel";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";

const POLL_INTERVAL_MS = 1000;
const INDEX_PATH = "/dashboard/conversations";

function toLeadMap(leads: ConversationLeadSummary[]): Map<string, string | null> {
  return new Map(leads.map((lead) => [lead.conversationId, lead.contactName]));
}

function toLastMessageMap(lastMessages: LastMessagePreview[]): Map<string, LastMessagePreview> {
  return new Map(lastMessages.map((preview) => [preview.conversationId, preview]));
}

/**
 * The persistent left rail of the conversations inbox (2026-09-11
 * redesign) -- lives in `conversations/layout.tsx`, so it never
 * remounts/re-fetches when navigating between conversations. Replaces the
 * former `DataTable`-based `ConversationsList`: a messaging inbox is a
 * list-of-chats UX, not a sortable CRM table (Leads/Appointments keep the
 * table, this doesn't). Reuses the exact same 1-second self-rescheduling
 * poll (`pollConversationsAction`) the old component had.
 */
export function ChatListPane({
  initialConversations,
  initialLeads,
  initialLastMessages,
}: {
  initialConversations: ConversationWithMessageCount[];
  initialLeads: ConversationLeadSummary[];
  initialLastMessages: LastMessagePreview[];
}) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState(initialConversations);
  const [leadByConversationId, setLeadByConversationId] = useState(() => toLeadMap(initialLeads));
  const [lastMessageByConversationId, setLastMessageByConversationId] = useState(() =>
    toLastMessageMap(initialLastMessages),
  );
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await pollConversationsAction();
      if (!isMountedRef.current) return;
      setConversations(result.conversations);
      setLeadByConversationId(toLeadMap(result.leads));
      setLastMessageByConversationId(toLastMessageMap(result.lastMessages));
    } catch {
      // A poll failure is invisible to the user -- keep the last-known
      // list and try again on the next tick.
    }

    if (!isMountedRef.current) return;
    if (document.visibilityState === "visible") {
      timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    isMountedRef.current = true;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void pollRef.current();
      } else if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  // Flagged conversations first, then most recent -- unchanged from the
  // former ConversationsList's own priority sort.
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
      return a.id > b.id ? -1 : 1;
    });
  }, [conversations]);

  // Channel pills are derived from whatever `source` values actually
  // exist in this business's data -- not hardcoded -- so a future channel
  // (e.g. Instagram) appears here automatically the day it ships.
  const availableChannels = useMemo(() => {
    const seen = new Set<string>();
    for (const conversation of conversations) seen.add(conversation.source ?? "chat_widget");
    return [...seen];
  }, [conversations]);

  const attentionCount = useMemo(
    () => conversations.filter((conversation) => conversation.needs_attention).length,
    [conversations],
  );

  const filtered = useMemo(() => {
    return sortedConversations
      .filter((conversation) => !attentionOnly || conversation.needs_attention)
      .filter((conversation) => channelFilter === "all" || (conversation.source ?? "chat_widget") === channelFilter);
  }, [sortedConversations, attentionOnly, channelFilter]);

  const showOnMobile = pathname === INDEX_PATH;

  return (
    <div
      className={`${showOnMobile ? "flex" : "hidden"} h-full min-h-0 w-full flex-col border-r border-ds-border bg-ds-surface md:flex md:w-80 md:shrink-0`}
    >
      <div className="flex flex-col gap-2 border-b border-ds-border p-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Conversations</h2>
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={channelFilter === "all"} onClick={() => setChannelFilter("all")} label={`All (${conversations.length})`} />
          {availableChannels.map((channel) => (
            <FilterPill
              key={channel}
              active={channelFilter === channel}
              onClick={() => setChannelFilter(channel)}
              label={channelLabel(channel)}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ds-text-secondary">
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(event) => setAttentionOnly(event.target.checked)}
            className="h-3.5 w-3.5 rounded-ds-sm border-ds-border text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          />
          Needs attention only{attentionCount > 0 ? ` (${attentionCount})` : ""}
        </label>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-ds-text-muted">
            {conversations.length === 0 ? "No conversations yet." : "No conversations match this filter."}
          </p>
        ) : (
          <ul>
            {filtered.map((conversation) => {
              const active = pathname === `/dashboard/conversations/${conversation.id}`;
              const contactName = leadByConversationId.get(conversation.id) ?? null;
              const lastMessage = lastMessageByConversationId.get(conversation.id) ?? null;
              const primaryLabel = contactName ?? channelLabel(conversation.source);
              const initial = (primaryLabel.trim().charAt(0) || "?").toUpperCase();

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/conversations/${conversation.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-start gap-2.5 border-b border-ds-border px-3 py-3 transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-accent ${
                      active ? "bg-ds-surface-elevated" : ""
                    }`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ds-surface-elevated text-xs font-semibold text-ds-accent">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ds-text-primary">{primaryLabel}</p>
                        {conversation.needs_attention ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-ds-warning"
                            aria-label="Needs attention"
                            title="Needs attention"
                          />
                        ) : null}
                      </div>
                      {lastMessage ? (
                        <p className="truncate text-xs text-ds-text-secondary">
                          {MESSAGE_ROLE_LABEL[lastMessage.role]}: {lastMessage.content}
                        </p>
                      ) : null}
                      <p className="truncate text-2xs text-ds-text-muted">
                        {channelLabel(conversation.source)} · {new Date(conversation.created_at).toLocaleDateString("en-US")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-2xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
        active
          ? "bg-dashboard-primary text-dashboard-on-primary"
          : "bg-ds-surface-soft text-ds-text-secondary hover:text-ds-text-primary"
      }`}
    >
      {label}
    </button>
  );
}
