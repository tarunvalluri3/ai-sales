"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { fetchConversationList, type ConversationLeadSummary } from "@/lib/dashboard-poll-client";
import { nextPollDelayMs, POLL_FAST_MS, POLL_SLOW_MS } from "@/lib/poll-cadence";
import { EmptyState } from "../../_components/state-views";
import { Avatar, ChannelIcon, Pill } from "../../_components/ui";
import { MESSAGE_ROLE_LABEL } from "./message-bubble";
import { channelLabel } from "@/lib/conversation-channel";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";
import { anonymousContactLabel, displayContactName } from "@/lib/lead-source";

// perf/reply-and-save-speed: polls GET /api/dashboard/conversations (no
// longer a Server Action, so a reply or take-over never waits behind it).
// On the list itself: every second while the list changed in the last 30 s,
// every 5 s otherwise (lib/poll-cadence.ts). With a conversation open,
// LiveConversationPanel polls that conversation and this list is secondary:
// every 5 s (was 4 s), so the two never double the load.
const INDEX_PATH = "/dashboard/conversations";

// A single dropped poll is deliberately invisible (see the catch block
// below) -- flashing an error for one blip that resolves itself on the
// very next tick would be noisier than helpful. This threshold instead
// catches the case a single-poll tolerance can't: the endpoint staying
// down, where the list would otherwise look fine forever with zero
// indication anything's wrong.
const STALE_FAILURE_THRESHOLD = 3;

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
 * cooperation from `<main>`'s own (unbounded) height. Self-rescheduling
 * poll of GET /api/dashboard/conversations; paused while the tab is hidden.
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
  const [isStale, setIsStale] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const consecutiveFailuresRef = useRef(0);
  // When the list last changed, and what it looked like then (drives 1 s / 5 s).
  const lastChangeAtRef = useRef(0);
  const lastSnapshotRef = useRef<string | null>(null);
  // Depends on `pathname` so the *next* scheduled tick always uses the
  // cadence for whichever route is current -- switching between the
  // index and a specific conversation re-runs the mount effect below
  // (cleanup + immediate reschedule), which only resets a timer.
  const isIndex = pathname === INDEX_PATH;
  const nextDelayMs = useCallback(
    () => (isIndex ? nextPollDelayMs(lastChangeAtRef.current, Date.now()) : POLL_SLOW_MS),
    [isIndex],
  );

  const poll = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await fetchConversationList();
      if (!isMountedRef.current) return;
      const snapshot = JSON.stringify(result);
      if (snapshot !== lastSnapshotRef.current) {
        lastSnapshotRef.current = snapshot;
        lastChangeAtRef.current = Date.now();
      }
      consecutiveFailuresRef.current = 0;
      setIsStale(false);
      setConversations(result.conversations);
      setLeadByConversationId(toLeadMap(result.leads));
      setLastMessageByConversationId(toLastMessageMap(result.lastMessages));
    } catch {
      // A single dropped poll is still invisible -- keep the last-known
      // list and try again on the next tick, no flash for one blip. Only
      // STALE_FAILURE_THRESHOLD consecutive failures surface the
      // "Updates paused" notice below.
      consecutiveFailuresRef.current += 1;
      if (isMountedRef.current && consecutiveFailuresRef.current >= STALE_FAILURE_THRESHOLD) {
        setIsStale(true);
      }
    }

    if (!isMountedRef.current) return;
    if (document.visibilityState === "visible") {
      timeoutRef.current = setTimeout(() => pollRef.current(), nextDelayMs());
    }
  }, [nextDelayMs]);

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

    lastChangeAtRef.current = Date.now();
    timeoutRef.current = setTimeout(() => pollRef.current(), isIndex ? POLL_FAST_MS : POLL_SLOW_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll, isIndex]);

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
      className={`${showOnMobile ? "flex" : "hidden"} h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-ds-border bg-ds-surface md:flex md:w-80`}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-ds-border p-3">
        <h1 className="text-sm font-medium text-ds-text-primary">Conversations</h1>
        {isStale ? (
          <p className="flex items-center gap-1 text-2xs text-ds-warning" role="status">
            <RefreshCw strokeWidth={1.75} className="size-3 animate-spin" aria-hidden="true" />
            Updates paused — retrying…
          </p>
        ) : null}
        {conversations.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5" aria-label="Conversation channel filter">
              <FilterPill
                active={channelFilter === "all"}
                onClick={() => setChannelFilter("all")}
                label="All"
                count={conversations.length}
              />
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
                className="size-3.5 rounded border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
              />
              Needs attention only{attentionCount > 0 ? ` (${attentionCount})` : ""}
            </label>
          </>
        ) : null}
      </div>

      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
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
          <ul className="dx-rows flex flex-col">
            {filtered.map((conversation) => {
              const active = pathname === `/dashboard/conversations/${conversation.id}`;
              const contactName = leadByConversationId.get(conversation.id) ?? null;
              const lastMessage = lastMessageByConversationId.get(conversation.id) ?? null;
              const primaryLabel = displayContactName(contactName) ?? anonymousContactLabel(conversation.source);
              const hasLead = leadByConversationId.has(conversation.id);

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/dashboard/conversations/${conversation.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-start gap-2.5 rounded-none px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-primary ${
                      active ? "bg-ds-lime-soft" : "hover:bg-ds-surface-soft"
                    }`}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ds-primary" /> : null}
                    <Avatar name={displayContactName(contactName)} source={conversation.source} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-ds-text-primary">{primaryLabel}</p>
                        {conversation.needs_attention ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-ds-attention"
                            aria-label="Needs attention"
                            title="Needs attention"
                          />
                        ) : null}
                        <span className="ml-auto shrink-0 text-2xs text-ds-text-muted">
                          {shortTimeAgo(conversation.created_at)}
                        </span>
                      </div>
                      {lastMessage ? (
                        <p className="truncate text-xs text-ds-text-secondary">
                          <span className="sr-only">{MESSAGE_ROLE_LABEL[lastMessage.role]}: </span>
                          {lastMessage.content}
                        </p>
                      ) : null}
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 text-2xs text-ds-text-muted">
                          <ChannelIcon source={conversation.source} className="size-3 shrink-0" strokeWidth={1.75} />
                          {channelLabel(conversation.source)}
                        </span>
                        {conversation.control === "human" ? (
                          <Pill tone="lime" size="sm">
                            Human
                          </Pill>
                        ) : null}
                        {hasLead ? (
                          <Pill tone="lime" size="sm">
                            Lead
                          </Pill>
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

/** "2m", "3h", "5d": the compact age shown at the end of each row. */
function shortTimeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}


function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary ${
        active
          ? "bg-ds-lime-mid text-ds-text-primary"
          : "border border-ds-border-strong bg-ds-surface text-ds-text-primary hover:bg-ds-surface-soft"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className={`rounded-full px-1.5 text-2xs font-medium ${active ? "bg-ds-lime text-ds-on-bright" : "bg-ds-surface-soft"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
