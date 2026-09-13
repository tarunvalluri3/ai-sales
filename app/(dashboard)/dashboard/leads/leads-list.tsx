"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { StatusSelect } from "./status-select";
import { assignTagToLeadAction, removeTagFromLeadAction } from "./actions";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "./lead-status";
import { EmptyState } from "../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { Badge, type BadgeTone } from "../_components/badge";
import { RemovableTagChip } from "../_components/tag-chip";
import { TagPicker } from "../_components/tag-picker";
import { channelLabel } from "@/lib/conversation-channel";
import type { PossibleDuplicateHint } from "@/lib/leads";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { Lead, LeadFollowUpStatus, LeadQualification, LeadStatus, LeadTag } from "@/lib/supabase/types";

const FOLLOW_UP_LABEL: Record<LeadFollowUpStatus, string> = {
  sent_email: "Follow-up sent by email",
  sent_whatsapp: "Follow-up sent via WhatsApp",
  blocked_no_whatsapp_template: "Follow-up drafted, blocked: no approved WhatsApp template",
  blocked_no_instagram_window: "Follow-up drafted, blocked: Instagram's message window has closed",
  no_contact_channel: "Follow-up drafted, no channel to send it on",
  send_failed: "Follow-up drafted, delivery failed — will retry",
};

const QUALIFICATION_TONE: Record<LeadQualification, BadgeTone> = {
  hot: "accent",
  warm: "success",
  cold: "muted",
};

// Past this length a 2-line clamp is likely to actually cut the text off
// (roughly two ~45-char lines at this card's width) -- below it, showing
// a "Show more" that reveals nothing new would just be noise.
const LONG_TEXT_THRESHOLD = 160;

// Highest-scoring leads surface first regardless of when they came in;
// recency breaks a tie (/impeccable layout -- same "priority first, then
// recent" thesis as ConversationsList's flagged-first sort). Phase 27:
// sorts by the actual numeric `score` now, not just the 3-tier
// hot/warm/cold bucket -- a lead scoring 6 outranks one scoring 4 even
// though both are "hot."

type TabId = "all" | LeadStatus;
const TAB_ORDER: TabId[] = ["all", ...LEAD_STATUSES];

export function LeadsList({
  leads,
  interestNameById,
  canEdit,
  possibleDuplicatesByLeadId,
  tags,
  tagsByLeadId,
}: {
  leads: Lead[];
  interestNameById: Record<string, string>;
  canEdit: boolean;
  possibleDuplicatesByLeadId: Record<string, PossibleDuplicateHint[]>;
  tags: LeadTag[];
  tagsByLeadId: Record<string, LeadTag[]>;
}) {
  const [tab, setTab] = useState<TabId>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());
  const shouldReduceMotion = useReducedMotion();

  function toggleActiveTag(tagId: string) {
    setActiveTagIds((previous) => {
      const next = new Set(previous);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
      return a.id > b.id ? -1 : 1;
    });
  }, [leads]);

  const countByStatus = useMemo(() => {
    const counts: Record<LeadStatus, number> = { new: 0, contacted: 0, converted: 0, lost: 0 };
    for (const lead of sortedLeads) counts[lead.status] += 1;
    return counts;
  }, [sortedLeads]);

  const statusFilteredLeads = tab === "all" ? sortedLeads : sortedLeads.filter((lead) => lead.status === tab);
  // Tag filter is "any of" (OR), not "all of" -- matches how the status
  // tabs and this filter compose: narrowing by status first, then by
  // whichever active tag pills are toggled on, same "AND across filter
  // groups, OR within one" convention most tag-filter UIs use.
  const displayedLeads =
    activeTagIds.size === 0
      ? statusFilteredLeads
      : statusFilteredLeads.filter((lead) =>
          (tagsByLeadId[lead.id] ?? []).some((tag) => activeTagIds.has(tag.id)),
        );
  const totalLabel = `${leads.length} lead${leads.length === 1 ? "" : "s"} total`;

  // Default order is the qualification-then-recency priority sort above
  // (`sort === null`); clicking "Created" overrides it with a plain
  // chronological sort in the chosen direction.
  const tableLeads = useMemo(() => {
    if (!sort) return displayedLeads;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...displayedLeads].sort((a, b) => direction * (a.created_at > b.created_at ? 1 : a.created_at < b.created_at ? -1 : 0));
  }, [displayedLeads, sort]);

  const columns = useMemo<DataTableColumn[]>(
    () => [
      { key: "prospect", label: "Prospect", width: "1.7fr" },
      { key: "contact", label: "Contact", width: "1.5fr" },
      { key: "interest", label: "Interest", width: "1.3fr" },
      { key: "status", label: "Status", width: "190px" },
      { key: "source", label: "Source", width: "130px" },
      { key: "created", label: "Created", width: "110px", sortable: true },
      { key: "actions", label: "", width: "70px", align: "right" },
    ],
    [],
  );

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

      {tags.length > 0 ? (
        <div role="group" aria-label="Filter leads by tag" className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => {
            const active = activeTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleActiveTag(tag.id)}
                className={`rounded-ds-sm transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${active ? "" : "opacity-50 hover:opacity-80"}`}
              >
                <Badge tone={tag.color} size="sm">
                  {tag.name}
                </Badge>
              </button>
            );
          })}
          {activeTagIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setActiveTagIds(new Set())}
              className="text-2xs font-medium text-ds-text-muted underline-offset-2 transition-colors hover:text-ds-text-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              Clear tag filter
            </button>
          ) : null}
        </div>
      ) : null}

      <div id="leads-tabpanel" role="tabpanel" aria-labelledby={`leads-tab-${tab}`}>
        {displayedLeads.length === 0 ? (
          <EmptyState
            title={`No ${tab === "all" ? "" : LEAD_STATUS_LABEL[tab as LeadStatus].toLowerCase() + " "}leads`}
            description="Nothing matches this filter right now."
            action={
              tab !== "all" || activeTagIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setTab("all");
                    setActiveTagIds(new Set());
                  }}
                  className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                >
                  View all leads
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <motion.div
              key={tab}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <DataTable
                items={tableLeads}
                columns={columns}
                getRowId={(lead) => lead.id}
                sort={sort}
                onSortChange={setSort}
                caption="Leads"
                renderRow={(lead) => (
                  <LeadRow
                    lead={lead}
                    canEdit={canEdit}
                    expanded={expandedIds.has(lead.id)}
                    onToggleExpanded={() => toggleExpanded(lead.id)}
                    interestNameById={interestNameById}
                    duplicates={possibleDuplicatesByLeadId[lead.id] ?? []}
                    allTags={tags}
                    leadTags={tagsByLeadId[lead.id] ?? []}
                  />
                )}
              />
            </motion.div>
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
 * A lead's main table row plus, when expanded, a second full-width row
 * beneath it carrying the content that doesn't fit fixed columns (AI
 * reasoning, notes, cross-channel duplicate hint, follow-up status) --
 * the standard "master row + expandable detail" pattern for a dense table,
 * reusing every piece of that content's original JSX unchanged.
 */
function LeadRow({
  lead,
  canEdit,
  expanded,
  onToggleExpanded,
  interestNameById,
  duplicates,
  allTags,
  leadTags,
}: {
  lead: Lead;
  canEdit: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  interestNameById: Record<string, string>;
  duplicates: PossibleDuplicateHint[];
  allTags: LeadTag[];
  leadTags: LeadTag[];
}) {
  const detailId = `lead-detail-${lead.id}`;
  const appliedTagIds = new Set(leadTags.map((tag) => tag.id));
  const availableTags = allTags.filter((tag) => !appliedTagIds.has(tag.id));
  const VISIBLE_TAG_CAP = 2;

  return (
    <>
      <TableRow>
        <TableCell className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ds-text-primary">{lead.contact_name ?? "Unnamed prospect"}</span>
            <span className="shrink-0">
              <Badge
                tone={QUALIFICATION_TONE[lead.qualification]}
                size="sm"
                title={`Score ${lead.score} out of ${MAX_LEAD_SCORE} -- AI-assessed signal, not verified`}
              >
                {lead.qualification}
                <span className="sr-only">
                  {" "}
                  lead, score {lead.score} out of {MAX_LEAD_SCORE} — AI-assessed signal, not verified
                </span>
              </Badge>
            </span>
            <span className="shrink-0 text-2xs text-ds-text-muted" aria-hidden="true">
              {lead.score}/{MAX_LEAD_SCORE}
            </span>
            {leadTags.slice(0, VISIBLE_TAG_CAP).map((tag) => (
              <span key={tag.id} className="shrink-0">
                <Badge tone={tag.color} size="sm">
                  {tag.name}
                </Badge>
              </span>
            ))}
            {leadTags.length > VISIBLE_TAG_CAP ? (
              <span className="shrink-0 text-2xs text-ds-text-muted">+{leadTags.length - VISIBLE_TAG_CAP}</span>
            ) : null}
          </div>
        </TableCell>
        <TableCell direction="col" className="gap-0.5 text-xs">
          <span className="text-ds-text-secondary">{lead.contact_email ?? "—"}</span>
          <span className="text-ds-text-muted">{lead.contact_phone ?? "—"}</span>
        </TableCell>
        <TableCell className="min-w-0">
          <span className="truncate">
            {lead.interest_type ?? "—"}
            {lead.interest_id ? ` — ${interestNameById[lead.interest_id] ?? "no longer available"}` : ""}
          </span>
        </TableCell>
        <TableCell>
          <StatusSelect id={lead.id} status={lead.status} canEdit={canEdit} />
        </TableCell>
        <TableCell className="min-w-0">
          {lead.source ? (
            <span
              title={lead.source}
              className="min-w-0 max-w-full truncate rounded-ds-sm bg-ds-surface-soft px-1.5 py-0.5 text-2xs font-medium text-ds-text-secondary"
            >
              {lead.source}
            </span>
          ) : (
            <span className="text-ds-text-muted">—</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-ds-text-muted">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
        <TableCell align="right" className="gap-1">
          <Link
            href={`/dashboard/conversations/${lead.conversation_id}`}
            aria-label="View conversation"
            title="View conversation"
            className="flex size-7 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={expanded ? "Hide details" : "Show details"}
            title={expanded ? "Hide details" : "Show details"}
            className="flex size-7 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell id={detailId} direction="col" className="col-span-full gap-2 bg-ds-surface-soft">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-ds-text-secondary">Tags:</span>
              {leadTags.length === 0 ? <span className="text-xs text-ds-text-muted">None yet</span> : null}
              {leadTags.map((tag) => (
                <RemovableTagChip
                  key={tag.id}
                  tag={tag}
                  action={removeTagFromLeadAction}
                  hiddenFields={{ leadId: lead.id, tagId: tag.id }}
                  canEdit={canEdit}
                />
              ))}
              {canEdit ? (
                <TagPicker
                  availableTags={availableTags}
                  action={assignTagToLeadAction}
                  hiddenFields={{ leadId: lead.id }}
                />
              ) : null}
            </div>
            <LeadTextBlock label="AI reasoning" text={lead.qualification_reason} textClassName="text-sm text-ds-text-muted" />
            {lead.notes ? (
              <LeadTextBlock label="Notes" text={lead.notes} textClassName="text-sm text-ds-text-secondary" />
            ) : null}
            {duplicates.length ? (
              <p className="rounded-ds-sm bg-ds-accent-soft-bg px-2.5 py-1.5 text-xs text-ds-accent-muted">
                Possibly the same prospect as{" "}
                {duplicates.map((hint, index) => (
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
              <div className="flex flex-col items-start gap-1 rounded-ds-sm bg-ds-surface-elevated px-2.5 py-1.5">
                <p className="text-xs font-medium text-ds-text-secondary">{FOLLOW_UP_LABEL[lead.follow_up_status]}</p>
                {lead.follow_up_message ? (
                  <LeadTextBlock label="Message" text={lead.follow_up_message} textClassName="text-xs text-ds-text-muted" />
                ) : null}
              </div>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Renders a labeled text field on a lead's expanded detail ("AI reasoning"
 * / "Notes") -- the explicit label is the actual fix (/impeccable
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
