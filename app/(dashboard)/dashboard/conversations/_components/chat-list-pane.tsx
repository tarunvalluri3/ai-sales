"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { pollConversationsAction, type ConversationLeadSummary } from "../actions";
import { EmptyState } from "../../_components/state-views";
import { Badge } from "../../_components/badge";
import { MESSAGE_ROLE_LABEL } from "./message-bubble";
import { channelLabel } from "@/lib/conversation-channel";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";

// Full speed while the list is the main view (nothing else to look at);
// slower once a specific conversation is open, where LiveConversationPanel
// runs its own concurrent 1s poll and this list becomes secondary --
// keeping this at full speed too was doubling steady-state polling load
// for the whole time any conversation is open, a real production
// performance regression (see STATE.md).
const POLL_INTERVAL_INDEX_MS = 1000;
const POLL_INTERVAL_DETAIL_MS = 4000;
const INDEX_PATH = "/dashboard/conversations";

function toLeadMap(leads: ConversationLeadSummary[]): Map<string, string | null> {
  return new Map(leads.map((lead) => [lead.conversationId, lead.contactName]));
}

function toLastMessageMap(lastMessages: LastMessagePreview[]): Map<string, LastMessagePreview> {
  return new Map(lastMessages.map((preview) => [preview.conversationId, preview]));
}

/**
 * The persistent left rail of the conversations inbox -- lives in
 * `conversations/layout.tsx`, so it never remounts/re-fetches when
 * navigating between conversations. Pinned to the viewport via
 * `sticky top-0 h-screen self-start` -- the exact same technique
 * `Sidebar` already uses one level up in the tree, so this needs no
 * cooperation from `<main>`'s own (unbounded) height. Reuses the exact
 * same 1-second self-rescheduling poll (`pollConversationsAction`) the
 * former `ConversationsList` had.
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
  // Depends on `pathname` so the *next* scheduled tick always uses the
  // interval for whichever route is current -- switching between the
  // index and a specific conversation re-runs the mount effect below
  // (cleanup + immediate reschedule at the new interval), which is fine:
  // it only resets a timer, it doesn't fire an extra poll.
  const pollInterval = pathname === INDEX_PATH ? POLL_INTERVAL_INDEX_MS : POLL_INTERVAL_DETAIL_MS;

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
      timeoutRef.current = setTimeout(() => pollRef.current(), pollInterval);
    }
  }, [pollInterval]);

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

    timeoutRef.current = setTimeout(() => pollRef.current(), pollInterval);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll, pollInterval]);

  // Flagged conversations first, then most recent; `id` is a pure
  // tiebreaker so two rows with an identical created_at never swap order
  // between poll ticks with nothing having actually changed -- unchanged
  // from the former ConversationsList's own priority sort.
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
      return a.id > b.id ? -1 : 1;
    });
  }, [conversations]);

  // Channel pills are derived from whatever `source` values actually
  // exist in this business's data -- not hardcoded -- so a future
  // channel (e.g. Instagram) appears here automatically the day it
  // ships, with no code change here.
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
      className={`${showOnMobile ? "flex" : "hidden"} sticky top-0 h-screen w-full shrink-0 flex-col self-start overflow-hidden border-r border-ds-border bg-ds-surface md:flex md:w-80`}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-ds-border p-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Conversations</h2>
        {conversations.length > 0 ? (
          <>
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
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hidden">
        {conversations.length === 0 ? (
          <div className="p-3">
            <EmptyState
              title="No conversations yet"
              description="Conversations started from your chat widget will appear here, with prospect and AI messages in real time."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              title="Nothing matches this filter"
              description="Try a different channel or clear the needs-attention filter."
            />
          </div>
        ) : (
          <ul>
            {filtered.map((conversation) => {
              const active = pathname === `/dashboard/conversations/${conversation.id}`;
              const contactName = leadByConversationId.get(conversation.id) ?? null;
              const lastMessage = lastMessageByConversationId.get(conversation.id) ?? null;
              const primaryLabel = contactName ?? channelLabel(conversation.source);
              const initial = (primaryLabel.trim().charAt(0) || "?").toUpperCase();
              const hasLead = leadByConversationId.has(conversation.id);

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
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-2xs text-ds-text-muted">
                          {channelLabel(conversation.source)} · {new Date(conversation.created_at).toLocaleDateString("en-US")}
                        </p>
                        {conversation.control === "human" ? (
                          <Badge tone="muted" size="sm">
                            Human
                          </Badge>
                        ) : null}
                        {hasLead ? (
                          <Badge tone="accent" size="sm">
                            Lead
                          </Badge>
                        ) : null}
                      </div>
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
