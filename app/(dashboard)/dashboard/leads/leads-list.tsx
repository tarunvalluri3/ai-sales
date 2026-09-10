"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { StatusSelect } from "./status-select";
import { bulkUpdateLeadStatusAction, type BulkUpdateStatusState } from "./actions";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "./lead-status";
import { EmptyState } from "../_components/state-views";
import type { PossibleDuplicateHint } from "@/lib/leads";
import type { Lead, LeadFollowUpStatus, LeadQualification, LeadStatus } from "@/lib/supabase/types";

const CHANNEL_LABEL: Record<string, string> = {
  chat_widget: "website chat",
  whatsapp: "WhatsApp",
};

function channelLabel(channel: string | null): string {
  return channel ? (CHANNEL_LABEL[channel] ?? channel) : "another conversation";
}

const FOLLOW_UP_LABEL: Record<LeadFollowUpStatus, string> = {
  sent_email: "Follow-up sent by email",
  sent_whatsapp: "Follow-up sent via WhatsApp",
  blocked_no_whatsapp_template: "Follow-up drafted, blocked: no approved WhatsApp template",
  no_contact_channel: "Follow-up drafted, no channel to send it on",
  send_failed: "Follow-up drafted, delivery failed — will retry",
};

const QUALIFICATION_STYLE: Record<LeadQualification, string> = {
  hot: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warm: "bg-ds-success-bg text-ds-success",
  cold: "bg-ds-surface-soft text-ds-text-muted",
};

// Past this length a 2-line clamp is likely to actually cut the text off
// (roughly two ~45-char lines at this card's width) -- below it, showing
// a "Show more" that reveals nothing new would just be noise.
const LONG_TEXT_THRESHOLD = 160;

// hot leads surface first regardless of when they came in; recency
// breaks ties within a qualification tier so the newest hot lead still
// leads the newest cold one (/impeccable layout -- same "priority first,
// then recent" thesis as ConversationsList's flagged-first sort).
const QUALIFICATION_RANK: Record<LeadQualification, number> = { hot: 0, warm: 1, cold: 2 };

type TabId = "all" | LeadStatus;
const TAB_ORDER: TabId[] = ["all", ...LEAD_STATUSES];

export function LeadsList({
  leads,
  interestNameById,
  canEdit,
  possibleDuplicatesByLeadId,
}: {
  leads: Lead[];
  interestNameById: Record<string, string>;
  canEdit: boolean;
  possibleDuplicatesByLeadId: Record<string, PossibleDuplicateHint[]>;
}) {
  const [tab, setTab] = useState<TabId>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // A selection only ever makes sense against what's currently visible --
  // clearing it whenever the tab changes means "select all" always means
  // "all in this view," never a stale cross-tab mix the toolbar can't act
  // on predictably. Reset during render (React's own pattern for this),
  // not in an effect, so it takes effect before the first paint of the
  // new tab instead of flashing the old selection for one frame.
  const [selectionTab, setSelectionTab] = useState(tab);
  if (selectionTab !== tab) {
    setSelectionTab(tab);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const rankDiff = QUALIFICATION_RANK[a.qualification] - QUALIFICATION_RANK[b.qualification];
      if (rankDiff !== 0) return rankDiff;
      if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
      return a.id > b.id ? -1 : 1;
    });
  }, [leads]);

  const countByStatus = useMemo(() => {
    const counts: Record<LeadStatus, number> = { new: 0, contacted: 0, converted: 0, lost: 0 };
    for (const lead of sortedLeads) counts[lead.status] += 1;
    return counts;
  }, [sortedLeads]);

  const displayedLeads = tab === "all" ? sortedLeads : sortedLeads.filter((lead) => lead.status === tab);
  const totalLabel = `${leads.length} lead${leads.length === 1 ? "" : "s"} total`;

  const visibleIds = useMemo(() => displayedLeads.map((lead) => lead.id), [displayedLeads]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  // `indeterminate` has no JSX prop -- it only exists as a live DOM
  // property, so it has to be set imperatively on every render where the
  // selection is a partial (neither empty nor complete) match.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  // Same WAI-ARIA tabs pattern as ConversationsList: roving tabIndex
  // handles the Tab-key stop, this handles Left/Right so a keyboard user
  // can actually reach every status without ever tabbing past it.
  function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = TAB_ORDER.indexOf(tab);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TAB_ORDER[(currentIndex + delta + TAB_ORDER.length) % TAB_ORDER.length];
    setTab(next);
    document.getElementById(`leads-tab-${next}`)?.focus();
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads yet"
        description="When a prospect shares contact details, the AI captures them here for follow-up."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Leads</h1>
        <p className="text-sm text-ds-text-secondary">{totalLabel}</p>
        <p className="text-xs text-ds-text-muted">
          Qualification is an AI-generated signal, not verified truth — always confirm from the conversation itself.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Filter leads by status"
        onKeyDown={handleTabListKeyDown}
        className="flex w-fit flex-wrap items-center gap-1 rounded-ds-lg border border-ds-border bg-ds-surface p-1"
      >
        <TabButton id="all" active={tab === "all"} onSelect={setTab} label="All" count={leads.length} />
        {LEAD_STATUSES.map((status) => (
          <TabButton
            key={status}
            id={status}
            active={tab === status}
            onSelect={setTab}
            label={LEAD_STATUS_LABEL[status]}
            count={countByStatus[status]}
          />
        ))}
      </div>

      <div id="leads-tabpanel" role="tabpanel" aria-labelledby={`leads-tab-${tab}`}>
        {displayedLeads.length === 0 ? (
          <EmptyState
            title={`No ${tab === "all" ? "" : LEAD_STATUS_LABEL[tab as LeadStatus].toLowerCase() + " "}leads`}
            description="Nothing matches this filter right now."
            action={
              tab !== "all" ? (
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  View all leads
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {canEdit ? (
              <div className="flex flex-col gap-2">
                <label className="flex w-fit items-center gap-2 text-xs text-ds-text-secondary pointer-coarse:min-h-11">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds))}
                    className="h-4 w-4 rounded-ds-sm border-ds-border text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  />
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                </label>
                {selectedIds.size > 0 ? (
                  <BulkActionsBar selectedIds={[...selectedIds]} onCleared={() => setSelectedIds(new Set())} />
                ) : null}
              </div>
            ) : null}
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {displayedLeads.map((lead) => (
                  <motion.li
                    key={lead.id}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4 transition-colors hover:border-ds-border-strong"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canEdit ? (
                          <label className="pointer-coarse:flex pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:-m-2">
                            <input
                              type="checkbox"
                              aria-label={`Select ${lead.contact_name ?? "this lead"}`}
                              checked={selectedIds.has(lead.id)}
                              onChange={() => toggleSelected(lead.id)}
                              className="h-4 w-4 rounded-ds-sm border-ds-border text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                            />
                          </label>
                        ) : null}
                        <p className="font-medium text-ds-text-primary">{lead.contact_name ?? "Unnamed prospect"}</p>
                        <span
                          title="AI-assessed signal -- not verified"
                          className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase ${QUALIFICATION_STYLE[lead.qualification]}`}
                        >
                          {lead.qualification}
                          <span className="sr-only"> lead — AI-assessed signal, not verified</span>
                        </span>
                      </div>
                      <StatusSelect id={lead.id} status={lead.status} canEdit={canEdit} />
                    </div>
                    <p className="text-sm text-ds-text-secondary">
                      {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
                    </p>
                    <p className="text-sm text-ds-text-secondary">
                      Interest: {lead.interest_type ?? "—"}
                      {lead.interest_id ? ` — ${interestNameById[lead.interest_id] ?? "no longer available"}` : ""}
                    </p>
                    <LeadTextBlock
                      label="AI reasoning"
                      text={lead.qualification_reason}
                      textClassName="text-sm text-ds-text-muted"
                    />
                    {lead.notes ? (
                      <LeadTextBlock label="Notes" text={lead.notes} textClassName="text-sm text-ds-text-secondary" />
                    ) : null}
                    {possibleDuplicatesByLeadId[lead.id]?.length ? (
                      <p className="rounded-ds-sm bg-ds-accent-soft-bg px-2.5 py-1.5 text-xs text-ds-accent-muted">
                        Possibly the same prospect as{" "}
                        {possibleDuplicatesByLeadId[lead.id].map((hint, index) => (
                          <span key={hint.leadId}>
                            {index > 0 ? ", " : ""}
                            <Link
                              href={`/dashboard/conversations/${hint.conversationId}`}
                              className="font-medium underline-offset-2 hover:underline"
                            >
                              a lead from {channelLabel(hint.channel)}
                            </Link>
                          </span>
                        ))}
                        . Shown as a hint only — nothing here is merged.
                      </p>
                    ) : null}
                    {lead.follow_up_status ? (
                      <div className="flex flex-col items-start gap-1 rounded-ds-sm bg-ds-surface-soft px-2.5 py-1.5">
                        <p className="text-xs font-medium text-ds-text-secondary">
                          {FOLLOW_UP_LABEL[lead.follow_up_status]}
                        </p>
                        {lead.follow_up_message ? (
                          <LeadTextBlock label="Message" text={lead.follow_up_message} textClassName="text-xs text-ds-text-muted" />
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-3">
                      <p className="flex items-center gap-1.5 text-xs text-ds-text-muted">
                        Source:
                        {lead.source ? (
                          <span className="rounded-ds-sm bg-ds-surface-soft px-1.5 py-0.5 text-2xs font-medium text-ds-text-secondary">
                            {lead.source}
                          </span>
                        ) : (
                          "—"
                        )}
                      </p>
                      <Link
                        href={`/dashboard/conversations/${lead.conversation_id}`}
                        className="inline-flex items-center text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11"
                      >
                        View conversation
                      </Link>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  label,
  count,
}: {
  id: TabId;
  active: boolean;
  onSelect: (id: TabId) => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`leads-tab-${id}`}
      aria-selected={active}
      aria-controls="leads-tabpanel"
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(id)}
      className={`flex items-center gap-1.5 rounded-ds-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 ${
        active
          ? "bg-dashboard-primary text-dashboard-on-primary"
          : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
          active ? "bg-white/20 text-dashboard-on-primary" : "bg-ds-surface-soft text-ds-text-secondary"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Renders a labeled text field on a lead card ("AI reasoning" /
 * "Notes") -- the explicit label is the actual fix (/impeccable
 * clarify): the critique found the AI's qualification_reason sitting at
 * identical visual weight to human-written notes with nothing but
 * proximity separating them, undermining PRODUCT.md's "AI output is
 * untrusted" rule in practice even though the page states it once at
 * the top. Long values (likely to overflow two lines) get a clamp with
 * an explicit "Show more" toggle rendered *outside* the clamped
 * paragraph -- a toggle placed inside a `line-clamp`'d node risks being
 * the exact content the clamp's ellipsis hides.
 */
function LeadTextBlock({
  label,
  text,
  textClassName,
}: {
  label: string;
  text: string;
  textClassName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_THRESHOLD;

  return (
    <div className="flex flex-col items-start gap-1">
      <p className={`${textClassName} ${!expanded && isLong ? "line-clamp-2" : ""}`}>
        <span className="font-medium text-ds-text-secondary">{label}: </span>
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center text-xs font-semibold text-ds-accent-muted underline-offset-2 transition-colors hover:text-ds-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

const initialBulkState: BulkUpdateStatusState = {};

/**
 * Bulk status toolbar for the leads a sales agent has checked (/impeccable
 * critique P2 -- repeating the same one-by-one status pick for many leads
 * felt like the missing piece next to how much StatusSelect had already
 * grown). Every status button is its own tiny `<form action={formAction}>`
 * carrying the same hidden `ids` inputs, matching this codebase's existing
 * one-form-per-action convention (DeleteButton, StatusSelect) rather than
 * reading which of several submit buttons in one form was clicked.
 * "Lost" reuses StatusSelect's own confirm-before-apply gate: bulk-losing
 * N leads at once is higher-stakes than one, not lower.
 */
function BulkActionsBar({ selectedIds, onCleared }: { selectedIds: string[]; onCleared: () => void }) {
  const [state, formAction, isPending] = useActionState(bulkUpdateLeadStatusAction, initialBulkState);
  const [confirmingLost, setConfirmingLost] = useState(false);
  const [confirmation, setConfirmation] = useState<{ status: LeadStatus; count: number } | null>(null);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the just-completed dispatch represents -- same reasoning as
  // StatusSelect's identical ref: `state.success` alone can repeat across
  // two different dispatches with nothing to key an effect off of.
  const lastChangeRef = useRef<{ status: LeadStatus; count: number } | null>(null);

  useEffect(() => {
    if (state.success && lastChangeRef.current) {
      setConfirmation(lastChangeRef.current);
      if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = setTimeout(() => setConfirmation(null), 6000);
      setConfirmingLost(false);
      onCleared();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    return () => {
      if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>, targetStatus: LeadStatus) {
    if (targetStatus === "lost" && !confirmingLost) {
      event.preventDefault();
      setConfirmingLost(true);
      return;
    }
    lastChangeRef.current = { status: targetStatus, count: selectedIds.length };
    setConfirmingLost(false);
  }

  const idInputs = selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />);

  if (confirmingLost) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-ds-lg border border-ds-border bg-ds-surface-soft px-3 py-2">
        <span className="text-xs text-ds-text-secondary">
          Mark {selectedIds.length} lead{selectedIds.length === 1 ? "" : "s"} as lost?
        </span>
        <form action={formAction} onSubmit={(event) => handleSubmit(event, "lost")}>
          {idInputs}
          <input type="hidden" name="status" value="lost" />
          <button
            type="submit"
            disabled={isPending}
            autoFocus
            className="inline-flex items-center rounded-ds-sm bg-ds-danger px-2.5 py-1.5 text-xs font-semibold text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger pointer-coarse:min-h-11 pointer-coarse:px-4"
          >
            {isPending ? "Saving…" : "Confirm lost"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirmingLost(false)}
          disabled={isPending}
          className="inline-flex items-center rounded-ds-sm px-2.5 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 pointer-coarse:px-4"
        >
          Cancel
        </button>
        {state.error ? (
          <span role="alert" className="w-full text-xs text-ds-danger">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-ds-lg border border-ds-border bg-ds-surface-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ds-text-secondary">Mark as:</span>
        {LEAD_STATUSES.map((targetStatus) => (
          <form key={targetStatus} action={formAction} onSubmit={(event) => handleSubmit(event, targetStatus)}>
            {idInputs}
            <input type="hidden" name="status" value={targetStatus} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1.5 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 pointer-coarse:px-4"
            >
              {LEAD_STATUS_LABEL[targetStatus]}
            </button>
          </form>
        ))}
        <button
          type="button"
          onClick={onCleared}
          disabled={isPending}
          className="inline-flex items-center rounded-ds-sm px-2.5 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 pointer-coarse:px-4"
        >
          Clear
        </button>
      </div>
      {confirmation ? (
        <span aria-live="polite" className="text-xs text-ds-text-secondary">
          {confirmation.count} lead{confirmation.count === 1 ? "" : "s"} changed to {LEAD_STATUS_LABEL[confirmation.status]}
        </span>
      ) : state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
