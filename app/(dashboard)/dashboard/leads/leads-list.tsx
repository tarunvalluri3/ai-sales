"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Info, Mail, MessageCircle, Phone, Sparkles, Tag, X } from "lucide-react";
import { StatusSelect } from "./status-select";
import { assignTagToLeadAction, removeTagFromLeadAction } from "./actions";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "./lead-status";
import { EmptyState } from "../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { RemovableTagChip } from "../_components/tag-chip";
import { TagPicker } from "../_components/tag-picker";
import { Avatar, Card, ChannelIcon, Pill, btnIcon, btnPrimary, btnPrimarySm, type PillTone } from "../_components/ui";
import { channelLabel } from "@/lib/conversation-channel";
import type { PossibleDuplicateHint } from "@/lib/leads";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { Lead, LeadFollowUpStatus, LeadQualification, LeadStatus, LeadTag } from "@/lib/supabase/types";
import { displayContactName, leadSourceLabel } from "@/lib/lead-source";

const FOLLOW_UP_LABEL: Record<LeadFollowUpStatus, string> = {
  sent_email: "Follow-up sent by email",
  sent_whatsapp: "Follow-up sent via WhatsApp",
  blocked_no_whatsapp_template: "Follow-up drafted, blocked: no approved WhatsApp template",
  blocked_no_instagram_window: "Follow-up drafted, blocked: Instagram's message window has closed",
  blocked_email_suppressed: "Follow-up drafted, not sent: this email address previously bounced or was reported as spam",
  no_contact_channel: "Follow-up drafted, no channel to send it on",
  send_failed: "Follow-up drafted, delivery failed — will retry",
};

/** Short chip beside the "Follow-up" heading; the full sentence sits underneath. */
const FOLLOW_UP_CHIP: Record<LeadFollowUpStatus, { label: string; tone: PillTone }> = {
  sent_email: { label: "Sent", tone: "lime" },
  sent_whatsapp: { label: "Sent", tone: "lime" },
  blocked_no_whatsapp_template: { label: "Blocked", tone: "amber" },
  blocked_no_instagram_window: { label: "Blocked", tone: "amber" },
  blocked_email_suppressed: { label: "Not sent", tone: "amber" },
  no_contact_channel: { label: "No channel", tone: "gray" },
  send_failed: { label: "Failed", tone: "red" },
};

const QUALIFICATION_DOT: Record<LeadQualification, string> = {
  hot: "bg-ds-primary",
  warm: "bg-ds-lime",
  cold: "bg-ds-mark-neutral",
};

const QUALIFICATION_LABEL: Record<LeadQualification, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

// Past this length a 3-line clamp is likely to actually cut the text off --
// below it, showing a "Show more" that reveals nothing new would just be noise.
const LONG_TEXT_THRESHOLD = 160;

// Highest-scoring leads surface first regardless of when they came in;
// recency breaks a tie (same "priority first, then recent" thesis as the
// Conversations list's flagged-first sort). Phase 27: sorts by the actual
// numeric `score`, not just the 3-tier hot/warm/cold bucket.

type TabId = "all" | LeadStatus;
const TAB_ORDER: TabId[] = ["all", ...LEAD_STATUSES];


function formatCreated(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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
  // The lead shown in the details card. `undefined` = nothing picked yet, so
  // the first lead in view is shown; `null` = the user closed the card.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
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
  // Tag filter is "any of" (OR), not "all of": AND across filter groups
  // (status, then tags), OR within the tag group.
  const displayedLeads =
    activeTagIds.size === 0
      ? statusFilteredLeads
      : statusFilteredLeads.filter((lead) => (tagsByLeadId[lead.id] ?? []).some((tag) => activeTagIds.has(tag.id)));

  // Default order is the score-then-recency priority sort above
  // (`sort === null`); clicking "Created" overrides it with a plain
  // chronological sort in the chosen direction.
  const tableLeads = useMemo(() => {
    if (!sort) return displayedLeads;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...displayedLeads].sort((a, b) => direction * (a.created_at > b.created_at ? 1 : a.created_at < b.created_at ? -1 : 0));
  }, [displayedLeads, sort]);

  // The Interest column only earns its space when at least one lead in the
  // current list has an interest; an all-"—" column is noise.
  const showInterest = tableLeads.some((lead) => Boolean(lead.interest_id) || Boolean(lead.interest_type));

  const columns = useMemo<DataTableColumn[]>(
    () => [
      { key: "prospect", label: "Prospect", width: "minmax(15rem,2fr)" },
      ...(showInterest ? [{ key: "interest", label: "Interest", width: "minmax(9rem,1.2fr)" }] : []),
      { key: "status", label: "Status", width: "10.5rem" },
      { key: "created", label: "Created", width: "8rem", sortable: true },
    ],
    [showInterest],
  );

  const selectedLead =
    selectedId === null
      ? null
      : (tableLeads.find((lead) => lead.id === selectedId) ?? (selectedId === undefined ? (tableLeads[0] ?? null) : null));

  // Same WAI-ARIA tabs pattern as elsewhere: roving tabIndex handles the
  // Tab-key stop, this handles Left/Right so a keyboard user can reach every
  // status without tabbing past it.
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

  const activeTags = tags.filter((tag) => activeTagIds.has(tag.id));
  const inactiveTags = tags.filter((tag) => !activeTagIds.has(tag.id));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
      <Card padded={false} className="flex min-w-0 flex-col gap-4 p-5">
        <div role="tablist" aria-label="Filter leads by status" onKeyDown={handleTabListKeyDown} className="dx-tabs">
          <TabButton id="all" active={tab === "all"} onSelect={setTab} label="All leads" count={leads.length} />
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
          <div role="group" aria-label="Filter leads by tag" className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-ds-border-strong px-3 text-sm font-medium text-ds-text-primary">
              <Tag className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Tags
            </span>
            {activeTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-pressed="true"
                onClick={() => toggleActiveTag(tag.id)}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-ds-surface-soft px-3 text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
              >
                {tag.name}
                <X strokeWidth={1.75} className="size-3.5" aria-hidden="true" />
              </button>
            ))}
            {inactiveTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-pressed="false"
                onClick={() => toggleActiveTag(tag.id)}
                className="inline-flex h-9 items-center rounded-xl border border-dashed border-ds-border-strong px-3 text-sm text-ds-text-secondary transition-colors hover:border-ds-primary hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
              >
                {tag.name}
              </button>
            ))}
            {activeTagIds.size > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTagIds(new Set())}
                className="inline-flex h-9 items-center rounded-xl px-2 text-sm text-ds-text-secondary underline-offset-4 transition-colors hover:text-ds-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="flex items-center gap-2 text-sm text-ds-text-secondary">
          <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          AI qualification is unverified. Check the conversation before acting.
        </p>

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
                    className={btnPrimarySm}
                  >
                    View all leads
                  </button>
                ) : undefined
              }
            />
          ) : (
            <motion.div
              key={tab}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex flex-col gap-3"
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
                    selected={selectedLead?.id === lead.id}
                    onSelect={() => setSelectedId(lead.id)}
                    interestNameById={interestNameById}
                    showInterest={showInterest}
                  />
                )}
              />
              <p className="px-1 text-sm text-ds-text-secondary italic">
                {sort ? "Sorted by created date" : "Sorted by score, then newest"}
              </p>
            </motion.div>
          )}
        </div>
      </Card>

      {selectedLead ? (
        <LeadDetails
          key={selectedLead.id}
          lead={selectedLead}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
          duplicates={possibleDuplicatesByLeadId[selectedLead.id] ?? []}
          allTags={tags}
          leadTags={tagsByLeadId[selectedLead.id] ?? []}
        />
      ) : (
        <Card className="hidden flex-col items-center gap-2 py-14 text-center xl:flex">
          <p className="text-sm font-medium text-ds-text-primary">Select a lead</p>
          <p className="max-w-xs text-sm text-ds-text-secondary">Pick a prospect from the list to see their details, tags and follow-up.</p>
        </Card>
      )}
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
      className="dx-tab focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary pointer-coarse:min-h-11"
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          active ? "bg-ds-lime-soft text-ds-primary" : "bg-ds-surface-soft text-ds-text-secondary"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** One lead in the table. Selecting the prospect cell opens it in the details card. */
function LeadRow({
  lead,
  canEdit,
  selected,
  onSelect,
  interestNameById,
  showInterest,
}: {
  lead: Lead;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
  interestNameById: Record<string, string>;
  showInterest: boolean;
}) {
  const rowTone = selected ? "bg-ds-lime-soft group-hover:bg-ds-surface-soft" : "";
  const displayName = displayContactName(lead.contact_name) ?? "Unnamed prospect";

  return (
    <TableRow>
      <TableCell className={`relative min-w-0 ${rowTone}`}>
        {selected ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-ds-primary" /> : null}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Show details for ${displayName}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          <span className="relative shrink-0">
            <Avatar name={lead.contact_name} source={lead.source} />
            <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-sm bg-ds-surface text-ds-text-primary">
              <ChannelIcon source={lead.source} className="size-3" strokeWidth={1.75} />
            </span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ds-text-primary">{displayName}</span>
            <span className="truncate text-xs text-ds-text-secondary">{lead.contact_email ?? lead.contact_phone ?? "—"}</span>
            <span
              className="flex items-center gap-1.5 text-sm text-ds-text-primary"
              title={`Score ${lead.score} out of ${MAX_LEAD_SCORE}. AI-assessed signal, not verified`}
            >
              <span aria-hidden="true" className={`size-2.5 rounded-full ${QUALIFICATION_DOT[lead.qualification]}`} />
              {QUALIFICATION_LABEL[lead.qualification]} · {lead.score}/{MAX_LEAD_SCORE}
              <span className="sr-only"> lead score, AI-assessed signal, not verified</span>
            </span>
          </span>
        </button>
      </TableCell>
      {showInterest ? (
        <TableCell className={`min-w-0 ${rowTone}`}>
          <span className="truncate capitalize">
            {lead.interest_id ? (interestNameById[lead.interest_id] ?? "No longer available") : (lead.interest_type ?? "—")}
          </span>
        </TableCell>
      ) : null}
      <TableCell className={rowTone}>
        <StatusSelect id={lead.id} status={lead.status} canEdit={canEdit} />
      </TableCell>
      <TableCell className={`text-sm text-ds-text-primary ${rowTone}`}>{formatCreated(lead.created_at)}</TableCell>
    </TableRow>
  );
}

/**
 * The right-hand "Lead details" card for the selected lead: who they are,
 * the link to their conversation, tags, human notes, the AI's reasoning
 * (labelled and boxed apart from the notes, per PRODUCT.md's "AI output is
 * untrusted" rule), follow-up status and the cross-channel duplicate hint.
 */
function LeadDetails({
  lead,
  canEdit,
  onClose,
  duplicates,
  allTags,
  leadTags,
}: {
  lead: Lead;
  canEdit: boolean;
  onClose: () => void;
  duplicates: PossibleDuplicateHint[];
  allTags: LeadTag[];
  leadTags: LeadTag[];
}) {
  const appliedTagIds = new Set(leadTags.map((tag) => tag.id));
  const availableTags = allTags.filter((tag) => !appliedTagIds.has(tag.id));
  const captured = new Date(lead.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card as="aside" aria-label="Lead details" className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
      <div className="flex items-center justify-between gap-3">
        <p className="ds-section-label">Lead details</p>
        <button type="button" onClick={onClose} aria-label="Close lead details" className={btnIcon}>
          <X strokeWidth={1.75} className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={lead.contact_name} source={lead.source} size="lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate text-base leading-tight font-medium text-ds-text-primary">
            {displayContactName(lead.contact_name) ?? "Unnamed prospect"}
          </h2>
          <p className="text-sm text-ds-text-secondary">Captured {captured}</p>
          <p className="flex flex-wrap items-center gap-2">
            <Pill tone="lime" dot>
              {QUALIFICATION_LABEL[lead.qualification]} · {lead.score}/{MAX_LEAD_SCORE}
            </Pill>
            <span className="text-sm text-ds-text-secondary">AI-assessed qualification</span>
          </p>
        </div>
      </div>

      <Link href={`/dashboard/conversations/${lead.conversation_id}`} className={`${btnPrimary} w-full`}>
        <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Open conversation
        <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
      </Link>

      <ul className="flex flex-col gap-2 border-b border-ds-border pb-4 text-sm text-ds-text-primary">
        <li className="flex items-center gap-3">
          <Mail className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">{lead.contact_email ?? "—"}</span>
        </li>
        <li className="flex items-center gap-3">
          <Phone className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">{lead.contact_phone ?? "—"}</span>
        </li>
        <li className="flex items-center gap-3">
          <ChannelIcon source={lead.source} className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{leadSourceLabel(lead.source)}</span>
        </li>
      </ul>

      <section className="flex flex-col gap-2 border-b border-ds-border pb-4">
        <h3 className="text-sm font-medium text-ds-text-primary">Tags</h3>
        <div className="flex flex-wrap items-center gap-2">
          {leadTags.length === 0 ? <span className="text-xs text-ds-text-secondary">None yet</span> : null}
          {leadTags.map((tag) => (
            <RemovableTagChip
              key={tag.id}
              tag={tag}
              action={removeTagFromLeadAction}
              hiddenFields={{ leadId: lead.id, tagId: tag.id }}
              canEdit={canEdit}
            />
          ))}
          {canEdit ? <TagPicker availableTags={availableTags} action={assignTagToLeadAction} hiddenFields={{ leadId: lead.id }} /> : null}
        </div>
      </section>

      {lead.preferred_time || lead.interest_note ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Asked for</h3>
          {/* The prospect's own words, via the AI: shown as a request to arrange, never as a booking. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {lead.interest_note ? (
              <>
                <dt className="text-ds-text-secondary">Service</dt>
                <dd className="min-w-0 break-words text-ds-text-primary">{lead.interest_note}</dd>
              </>
            ) : null}
            {lead.preferred_time ? (
              <>
                <dt className="text-ds-text-secondary">Preferred time</dt>
                <dd className="min-w-0 break-words text-ds-text-primary">{lead.preferred_time} (not booked; call to arrange)</dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      {lead.notes ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">Notes</h3>
          <LeadTextBlock text={lead.notes} textClassName="text-sm leading-relaxed text-ds-text-primary" />
        </section>
      ) : null}

      <section className="flex gap-3 rounded-2xl bg-ds-surface-soft p-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-ds-primary" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium text-ds-text-primary">AI reasoning</h3>
          <LeadTextBlock text={lead.qualification_reason} textClassName="text-sm leading-relaxed text-ds-text-primary" />
          <p className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
            <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            AI-generated · Not verified
          </p>
        </div>
      </section>

      {lead.follow_up_status ? (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2.5 text-sm font-medium text-ds-text-primary">
            Follow-up
            <Pill tone={FOLLOW_UP_CHIP[lead.follow_up_status].tone} size="sm">
              {FOLLOW_UP_CHIP[lead.follow_up_status].label}
            </Pill>
          </h3>
          <p className="text-xs text-ds-text-primary">{FOLLOW_UP_LABEL[lead.follow_up_status]}</p>
          {lead.follow_up_message ? (
            <div className="flex gap-2.5 rounded-xl border border-ds-border-strong px-3.5 py-2.5">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-ds-text-secondary" strokeWidth={1.75} aria-hidden="true" />
              <LeadTextBlock text={lead.follow_up_message} textClassName="text-sm leading-relaxed text-ds-text-secondary italic" />
            </div>
          ) : null}
        </section>
      ) : null}

      {duplicates.length ? (
        <p className="flex items-start gap-2 border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            Possible match:{" "}
            {duplicates.map((hint, index) => (
              <span key={hint.leadId}>
                {index > 0 ? ", " : ""}
                <Link
                  href={`/dashboard/conversations/${hint.conversationId}`}
                  className="font-medium text-ds-primary underline-offset-4 hover:underline"
                >
                  a lead from {channelLabel(hint.channel)}
                </Link>
              </span>
            ))}
            . Nothing has been merged.
          </span>
        </p>
      ) : null}
    </Card>
  );
}

/**
 * A text field in the details card. Long values get a clamp with an explicit
 * "Show more" toggle rendered *outside* the clamped paragraph -- a toggle
 * placed inside a `line-clamp`'d node risks being the exact content the
 * clamp's ellipsis hides.
 */
function LeadTextBlock({ text, textClassName }: { text: string; textClassName: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_THRESHOLD;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <p className={`${textClassName} ${!expanded && isLong ? "line-clamp-3" : ""}`}>{text}</p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center rounded-md text-sm font-medium text-ds-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary pointer-coarse:min-h-11"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
