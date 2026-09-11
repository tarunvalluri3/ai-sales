"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { pollConversationsAction, type ConversationLeadSummary } from "../actions";
import { EmptyState } from "../../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../../_components/data-table";
import { MESSAGE_ROLE_LABEL } from "./message-bubble";
import type { ConversationWithMessageCount } from "@/lib/conversations";
import type { LastMessagePreview } from "@/lib/messages";

const COLUMNS: DataTableColumn[] = [
  { key: "prospect", label: "Prospect", width: "1.6fr" },
  { key: "last_message", label: "Last message", width: "2fr" },
  { key: "status", label: "Status", width: "1fr" },
  { key: "started", label: "Started", width: "170px", sortable: true, align: "right" },
];

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
  const [sort, setSort] = useState<SortState>(null);
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

  // Default order is the existing flagged-first-then-recent priority sort
  // above (`sort === null`); clicking the "Started" column header switches
  // to a plain chronological sort in the chosen direction. Only "started"
  // is sortable today (`created_at` is the only timestamp a conversation
  // has), so no other key needs handling here.
  const tableConversations = useMemo(() => {
    if (!sort) return displayedConversations;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...displayedConversations].sort(
      (a, b) => direction * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
  }, [displayedConversations, sort]);

  // Arrow-key navigation for the two-tab tablist, per the WAI-ARIA tabs
  // pattern -- roving tabIndex alone (below) only removes the unselected
  // tab from the Tab-key order; without this, a keyboard user could never
  // reach it at all.
  function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "attention" ? "all" : "attention";
    setTab(next);
    document.getElementById(`conversations-tab-${next}`)?.focus();
  }

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
            onKeyDown={handleTabListKeyDown}
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
              <motion.div
                key={tab}
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <DataTable
                  items={tableConversations}
                  columns={COLUMNS}
                  getRowId={(conversation) => conversation.id}
                  sort={sort}
                  onSortChange={setSort}
                  caption="Conversations"
                  renderRow={(conversation) => (
                    <ConversationRow
                      conversation={conversation}
                      contactName={leadByConversationId.get(conversation.id) ?? null}
                      hasLead={leadByConversationId.has(conversation.id)}
                      lastMessage={lastMessageByConversationId.get(conversation.id) ?? null}
                      showAttentionBadge={tab !== "attention"}
                    />
                  )}
                />
              </motion.div>
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
 * the meta line instead of disappearing. `showAttentionBadge` is false on
 * the Needs-attention tab, where every row would otherwise repeat the
 * identical badge -- pure noise once the tab itself already says so.
 */
function ConversationRow({
  conversation,
  contactName,
  hasLead,
  lastMessage,
  showAttentionBadge,
}: {
  conversation: ConversationWithMessageCount;
  contactName: string | null;
  hasLead: boolean;
  lastMessage: LastMessagePreview | null;
  showAttentionBadge: boolean;
}) {
  const sourceLabel = conversation.source ?? "Chat widget";
  const primaryLabel = contactName ?? sourceLabel;
  const showSourceInMeta = contactName !== null;

  return (
    <TableRow href={`/dashboard/conversations/${conversation.id}`}>
      <TableCell className="min-w-0">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium text-ds-text-primary">{primaryLabel}</p>
          {showSourceInMeta ? <p className="truncate text-2xs text-ds-text-muted">{sourceLabel}</p> : null}
        </div>
      </TableCell>
      <TableCell className="min-w-0">
        {lastMessage ? (
          <p className="truncate text-xs text-ds-text-secondary">
            {MESSAGE_ROLE_LABEL[lastMessage.role]}: {lastMessage.content}
          </p>
        ) : (
          <span className="text-xs text-ds-text-muted">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          {conversation.needs_attention && showAttentionBadge ? (
            <span className="rounded-ds-sm bg-ds-warning-bg px-2 py-0.5 text-2xs font-semibold tracking-wide-ds text-ds-warning uppercase">
              Needs attention
            </span>
          ) : null}
          {conversation.control === "human" ? (
            <span className="rounded-ds-sm bg-ds-surface-soft px-2 py-0.5 text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">
              Human
            </span>
          ) : null}
          {hasLead ? (
            <span className="rounded-ds-sm bg-ds-accent-soft-bg px-2 py-0.5 text-2xs font-semibold tracking-wide-ds text-ds-accent-muted uppercase">
              Lead
            </span>
          ) : null}
          {!conversation.needs_attention && conversation.control !== "human" && !hasLead ? (
            <span className="text-xs text-ds-text-muted">—</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell align="right" direction="col" className="gap-0">
        <span className="text-xs text-ds-text-secondary">{new Date(conversation.created_at).toLocaleDateString()}</span>
        <span className="text-2xs text-ds-text-muted">
          {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}
        </span>
      </TableCell>
    </TableRow>
  );
}
