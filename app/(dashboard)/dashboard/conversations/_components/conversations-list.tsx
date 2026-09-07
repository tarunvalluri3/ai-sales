"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { pollConversationsAction, type ConversationLeadSummary } from "../actions";
import { EmptyState } from "../../_components/state-views";
import { MESSAGE_ROLE_LABEL } from "./message-bubble";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";

const POLL_INTERVAL_MS = 1000;

function toLeadMap(leads: ConversationLeadSummary[]): Map<string, string | null> {
  return new Map(leads.map((lead) => [lead.conversationId, lead.contactName]));
}

function toLastMessageMap(lastMessages: LastMessagePreview[]): Map<string, LastMessagePreview> {
  return new Map(lastMessages.map((preview) => [preview.conversationId, preview]));
}

/**
 * Owns the conversations list's live state: polling (same
 * self-rescheduling setTimeout shape as AttentionProvider and
 * LiveConversationPanel -- pause on tab-hidden, immediate poll on
 * resume, cleanup on unmount), the Needs attention / All split, and a
 * flagged-first sort applied only to this view's own copy of the data
 * -- lib/conversations.ts's listConversationsForBusiness() keeps its
 * plain created_at-desc order unchanged, since the dashboard overview
 * page's "recent activity" widget depends on that order staying
 * chronological.
 */
export function ConversationsList({
  initialConversations,
  initialLeads,
  initialLastMessages,
}: {
  initialConversations: ConversationWithMessageCount[];
  initialLeads: ConversationLeadSummary[];
  initialLastMessages: LastMessagePreview[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [leadByConversationId, setLeadByConversationId] = useState(() => toLeadMap(initialLeads));
  const [lastMessageByConversationId, setLastMessageByConversationId] = useState(() =>
    toLastMessageMap(initialLastMessages),
  );
  const [tab, setTab] = useState<"attention" | "all">("all");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const shouldReduceMotion = useReducedMotion();

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

  // Flagged conversations first, then most recent; `id` is a pure
  // tiebreaker so two rows with an identical created_at never swap
  // order between poll ticks with nothing having actually changed.
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.needs_attention !== b.needs_attention) {
        return a.needs_attention ? -1 : 1;
      }
      if (a.created_at !== b.created_at) {
        return a.created_at > b.created_at ? -1 : 1;
      }
      return a.id > b.id ? -1 : 1;
    });
  }, [conversations]);

  const attentionConversations = useMemo(
    () => sortedConversations.filter((conversation) => conversation.needs_attention),
    [sortedConversations],
  );

  const displayedConversations = tab === "attention" ? attentionConversations : sortedConversations;
  const totalLabel = `${conversations.length} conversation${conversations.length === 1 ? "" : "s"} total`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Conversations</h1>
        <p className="text-sm text-ds-text-secondary">{totalLabel}</p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Conversations started from your chat widget will appear here, with prospect and AI messages in real time."
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Filter conversations"
            className="inline-flex w-fit items-center gap-1 rounded-ds-lg border border-ds-border bg-ds-surface p-1"
          >
            <button
              type="button"
              role="tab"
              id="conversations-tab-attention"
              aria-selected={tab === "attention"}
              aria-controls="conversations-tabpanel"
              tabIndex={tab === "attention" ? 0 : -1}
              onClick={() => setTab("attention")}
              className={`flex items-center gap-1.5 rounded-ds-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                tab === "attention"
                  ? "bg-dashboard-primary text-dashboard-on-primary"
                  : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
              }`}
            >
              Needs attention
              {attentionConversations.length > 0 ? (
                <span className="rounded-full bg-ds-warning px-1.5 py-0.5 text-2xs font-semibold text-ds-bg">
                  {attentionConversations.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              id="conversations-tab-all"
              aria-selected={tab === "all"}
              aria-controls="conversations-tabpanel"
              tabIndex={tab === "all" ? 0 : -1}
              onClick={() => setTab("all")}
              className={`flex items-center gap-1.5 rounded-ds-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                tab === "all"
                  ? "bg-dashboard-primary text-dashboard-on-primary"
                  : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
              }`}
            >
              All
              <span className="rounded-full bg-ds-surface-soft px-1.5 py-0.5 text-2xs font-semibold text-ds-text-secondary">
                {conversations.length}
              </span>
            </button>
          </div>

          <div
            id="conversations-tabpanel"
            role="tabpanel"
            aria-labelledby={tab === "attention" ? "conversations-tab-attention" : "conversations-tab-all"}
          >
            {displayedConversations.length === 0 ? (
              <EmptyState
                title="Nothing needs attention right now"
                description="Conversations only show up here when the AI flags something for a human to check. Everything else is running on its own."
                action={
                  <button
                    type="button"
                    onClick={() => setTab("all")}
                    className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    View all conversations
                  </button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {displayedConversations.map((conversation) => (
                    <motion.li
                      key={conversation.id}
                      layout={!shouldReduceMotion}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <ConversationRow
                        conversation={conversation}
                        contactName={leadByConversationId.get(conversation.id) ?? null}
                        hasLead={leadByConversationId.has(conversation.id)}
                        lastMessage={lastMessageByConversationId.get(conversation.id) ?? null}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A row's primary label is the lead's contact name when one exists
 * (falling back to the conversation's source/"Chat widget" otherwise) --
 * a conversation with no snippet or identity used to be indistinguishable
 * from every other "Chat widget · date" row (/impeccable critique
 * finding). When a name takes the primary slot, the source moves into
 * the meta line instead of disappearing.
 */
function ConversationRow({
  conversation,
  contactName,
  hasLead,
  lastMessage,
}: {
  conversation: ConversationWithMessageCount;
  contactName: string | null;
  hasLead: boolean;
  lastMessage: LastMessagePreview | null;
}) {
  const sourceLabel = conversation.source ?? "Chat widget";
  const primaryLabel = contactName ?? sourceLabel;
  const showSourceInMeta = contactName !== null;

  return (
    <Link
      href={`/dashboard/conversations/${conversation.id}`}
      className="group flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3.5 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-sm font-medium text-ds-text-primary">{primaryLabel}</p>
        {lastMessage ? (
          <p className="truncate text-xs text-ds-text-secondary">
            {MESSAGE_ROLE_LABEL[lastMessage.role]}: {lastMessage.content}
          </p>
        ) : null}
        <p className="text-2xs text-ds-text-muted">
          {new Date(conversation.created_at).toLocaleString()} · {conversation.messageCount} message
          {conversation.messageCount === 1 ? "" : "s"}
          {showSourceInMeta ? ` · ${sourceLabel}` : ""}
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
        {hasLead ? (
          <span className="rounded-ds-sm bg-ds-accent-soft-bg px-2.5 py-1 text-2xs font-semibold tracking-wide-ds text-ds-accent-muted uppercase">
            Lead
          </span>
        ) : null}
      </div>
    </Link>
  );
}
