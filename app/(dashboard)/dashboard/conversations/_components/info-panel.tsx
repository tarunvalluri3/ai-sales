import Link from "next/link";
import { ArrowUpRight, CalendarDays, CircleDot, Flag, Info, Mail, Phone, ShieldAlert, Target, UserRound } from "lucide-react";
import { AiSummaryCard } from "./ai-summary-card";
import { formatDateTime } from "@/lib/format-business-time";
import { TagsCard } from "./tags-card";
import { Pill, linkAccent, type PillTone } from "../../_components/ui";
import { channelLabel } from "@/lib/conversation-channel";
import type {
  Appointment,
  AppointmentStatus,
  Conversation,
  Lead,
  LeadQualification,
  LeadTag,
} from "@/lib/supabase/types";
import { displayContactName } from "@/lib/lead-source";

const QUALIFICATION_TONE: Record<LeadQualification, PillTone> = {
  hot: "solid",
  warm: "amber",
  cold: "gray",
};

const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, PillTone> = {
  pending: "amber",
  confirmed: "lime",
  declined: "red",
  cancelled: "gray",
  completed: "solid",
  no_show: "red",
  expired: "gray",
};

const SUB_CARD = "flex flex-col gap-2.5 rounded-2xl border border-ds-border p-4";
const SUB_TITLE = "flex items-center gap-2.5 text-sm font-medium text-ds-text-primary";

/**
 * The right-hand "Prospect context" card of the conversation detail view:
 * the recommended next action, the on-demand AI summary, tags, the lead, the
 * appointment, anything the guardrails flagged, and the conversation's own
 * details. Pure server-rendered composition except `AiSummaryCard` and
 * `TagsCard`, the two interactive islands.
 */
export function InfoPanel({
  conversation,
  lead,
  interestName,
  appointment,
  messageCount,
  timezone,
  conversationTags,
  catalogTags,
  canEditTags,
  recommendedAction,
  guardrailFlags,
}: {
  conversation: Conversation;
  lead: Lead | null;
  interestName: string | null;
  appointment: Appointment | null;
  messageCount: number;
  timezone: string;
  conversationTags: LeadTag[];
  catalogTags: LeadTag[];
  canEditTags: boolean;
  /** Phase 30: a deterministic Sales Copilot hint -- untrusted only in the sense that priority weighting is a product judgment call, never fabricated (every input is a real stored field). Null when this conversation has no linked customer yet. */
  recommendedAction: string | null;
  /** Guardrails Phase 5: what the guardrails caught in this conversation, e.g. "2 prompt-injection attempts". Empty = nothing flagged, and nothing is rendered. */
  guardrailFlags: string[];
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-1">
        <h2 className="dx-title">Prospect context</h2>
        <span className="flex items-center gap-2 text-sm text-ds-text-primary">
          <span aria-hidden="true" className="size-2 rounded-full bg-ds-success-bright" />
          Live details
        </span>
      </div>

      {recommendedAction ? (
        <div className="flex items-start gap-3 rounded-2xl bg-ds-surface-soft p-3">
          <Target className="mt-0.5 size-5 shrink-0 text-ds-primary" strokeWidth={1.75} aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium text-ds-text-primary">Next best action</span>
            <span className="text-sm leading-snug font-medium text-ds-text-primary">{recommendedAction}</span>
          </div>
        </div>
      ) : null}

      <AiSummaryCard
        conversationId={conversation.id}
        initialSummary={conversation.ai_summary}
        initialGeneratedAt={conversation.ai_summary_generated_at}
        initialMessageCount={conversation.ai_summary_message_count}
        currentMessageCount={messageCount}
      />

      <TagsCard
        conversationId={conversation.id}
        initialTags={conversationTags}
        catalogTags={catalogTags}
        canEdit={canEditTags}
      />

      {lead ? (
        <div className={SUB_CARD}>
          <h3 className={SUB_TITLE}>
            <UserRound className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Lead
          </h3>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ds-text-primary">{displayContactName(lead.contact_name) ?? "Unnamed prospect"}</p>
            <span className="flex items-center gap-1.5">
              <Pill tone={QUALIFICATION_TONE[lead.qualification]} size="sm" dot className="capitalize" title="AI-assessed signal, not verified">
                {lead.qualification}
              </Pill>
              <Pill tone="outline" size="sm">
                AI-assessed
              </Pill>
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-ds-text-primary">
            <li className="flex items-center gap-2.5">
              <Mail className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{lead.contact_email ?? "—"}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{lead.contact_phone ?? "—"}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CircleDot className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Interest: {lead.interest_type ?? "—"}
                {lead.interest_id ? ` — ${interestName ?? "no longer available"}` : ""}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <Flag className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Status:</span>
              <Pill tone="lime" size="sm" className="capitalize">
                {lead.status}
              </Pill>
            </li>
          </ul>
          <p className="text-sm leading-relaxed text-ds-text-secondary">AI-written reason: {lead.qualification_reason}</p>
          {lead.notes ? <p className="text-sm leading-relaxed text-ds-text-secondary">Notes: {lead.notes}</p> : null}
          {conversation.customer_id ? (
            <div className="border-t border-ds-border pt-2.5">
              <Link href={`/dashboard/customers/${conversation.customer_id}`} className={linkAccent}>
                View customer profile
                <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={SUB_CARD}>
          <h3 className={SUB_TITLE}>
            <UserRound className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Lead
          </h3>
          <p className="text-sm text-ds-text-secondary">No lead captured from this conversation yet.</p>
        </div>
      )}

      <div className={SUB_CARD}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={SUB_TITLE}>
            <CalendarDays className="size-5" strokeWidth={1.75} aria-hidden="true" />
            Appointment
          </h3>
          {appointment ? (
            <Pill tone={APPOINTMENT_STATUS_TONE[appointment.status]} size="sm" className="capitalize">
              {appointment.status.replace("_", "-")}
            </Pill>
          ) : null}
        </div>
        {appointment ? (
          <>
            <p className="text-sm font-medium text-ds-text-primary">
              {formatDateTime(appointment.starts_at, timezone)}
            </p>
            {appointment.notes ? <p className="text-sm text-ds-text-secondary">{appointment.notes}</p> : null}
            <Link href="/dashboard/appointments" className={linkAccent}>
              View in Appointments
              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <p className="text-sm text-ds-text-secondary">No appointment booked</p>
        )}
      </div>

      {guardrailFlags.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-ds-warning-bg p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className={SUB_TITLE}>
              <ShieldAlert className="size-5" strokeWidth={1.75} aria-hidden="true" />
              Flagged by guardrails
            </h3>
            <Pill tone="outline" size="sm">
              Review
            </Pill>
          </div>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {guardrailFlags.map((flag) => (
              <li key={flag} className="text-xs text-ds-text-primary">
                {flag}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ds-text-secondary">
            The AI&apos;s safety checks caught these in this conversation. Check the transcript before replying.
          </p>
        </div>
      ) : null}

      <div className={SUB_CARD}>
        <h3 className={SUB_TITLE}>
          <Info className="size-5" strokeWidth={1.75} aria-hidden="true" />
          Conversation details
        </h3>
        <p className="text-sm text-ds-text-secondary">
          {channelLabel(conversation.source)} · {messageCount} message{messageCount === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-ds-text-secondary">Started: {formatDateTime(conversation.created_at, timezone)}</p>
        {conversation.needs_attention ? <p className="text-sm font-medium text-ds-warning">Needs attention</p> : null}
      </div>
    </div>
  );
}
