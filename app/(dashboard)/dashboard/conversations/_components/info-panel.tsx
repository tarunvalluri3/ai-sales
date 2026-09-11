import Link from "next/link";
import { AiSummaryCard } from "./ai-summary-card";
import { channelLabel } from "@/lib/conversation-channel";
import type { Appointment, AppointmentStatus, Conversation, Lead, LeadQualification } from "@/lib/supabase/types";
import type { PossibleDuplicateHint } from "@/lib/leads";

const QUALIFICATION_STYLE: Record<LeadQualification, string> = {
  hot: "bg-ds-accent-soft-bg text-ds-accent-muted",
  warm: "bg-ds-success-bg text-ds-success",
  cold: "bg-ds-surface-soft text-ds-text-muted",
};

const APPOINTMENT_STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: "bg-ds-accent-soft-bg text-ds-accent-muted",
  confirmed: "bg-ds-success-bg text-ds-success",
  declined: "bg-ds-danger-bg text-ds-danger",
  cancelled: "bg-ds-surface-soft text-ds-text-muted",
  completed: "bg-ds-success-bg text-ds-success",
  no_show: "bg-ds-danger-bg text-ds-danger",
};

function channelHintLabel(channel: string | null): string {
  return channel ? channelLabel(channel) : "another conversation";
}

/**
 * The right-hand "useful info" pane of the conversation detail view
 * (2026-09-11 inbox redesign) -- everything the old page's single lead
 * card showed, plus what it didn't (appointment, follow-up status,
 * cross-channel duplicate hint), plus the new on-demand AI summary.
 * Pure server-rendered composition except `AiSummaryCard`, the one
 * interactive island.
 */
export function InfoPanel({
  conversation,
  lead,
  interestName,
  appointment,
  duplicates,
  messageCount,
  timezone,
}: {
  conversation: Conversation;
  lead: Lead | null;
  interestName: string | null;
  appointment: Appointment | null;
  duplicates: PossibleDuplicateHint[];
  messageCount: number;
  timezone: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto border-t border-ds-border bg-ds-bg p-4 md:border-t-0 md:border-l">
      <AiSummaryCard
        conversationId={conversation.id}
        initialSummary={conversation.ai_summary}
        initialGeneratedAt={conversation.ai_summary_generated_at}
        initialMessageCount={conversation.ai_summary_message_count}
        currentMessageCount={messageCount}
      />

      {lead ? (
        <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ds-text-primary">Lead</h3>
            <span
              title="AI-assessed signal -- not verified"
              className={`rounded-ds-sm px-2.5 py-1 text-2xs font-semibold tracking-wide-ds uppercase ${QUALIFICATION_STYLE[lead.qualification]}`}
            >
              {lead.qualification}
            </span>
          </div>
          <p className="font-medium text-ds-text-primary">{lead.contact_name ?? "Unnamed prospect"}</p>
          <p className="text-sm text-ds-text-secondary">
            {lead.contact_email ?? "—"} · {lead.contact_phone ?? "—"}
          </p>
          <p className="text-sm text-ds-text-secondary">
            Interest: {lead.interest_type ?? "—"}
            {lead.interest_id ? ` — ${interestName ?? "no longer available"}` : ""}
          </p>
          <p className="text-sm text-ds-text-muted">AI-written reason: {lead.qualification_reason}</p>
          {lead.notes ? <p className="text-sm text-ds-text-secondary">Notes: {lead.notes}</p> : null}
          <p className="text-xs text-ds-text-muted">Status: {lead.status}</p>
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
                    a lead from {channelHintLabel(hint.channel)}
                  </Link>
                </span>
              ))}
              . Shown as a hint only — nothing here is merged.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-ds-lg border border-dashed border-ds-border bg-ds-surface px-4 py-6 text-center text-xs text-ds-text-muted">
          No lead captured from this conversation yet.
        </div>
      )}

      {appointment ? (
        <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-ds-text-primary">Appointment</h3>
            <span
              className={`rounded-ds-sm px-2.5 py-1 text-2xs font-semibold tracking-wide-ds uppercase ${APPOINTMENT_STATUS_STYLE[appointment.status]}`}
            >
              {appointment.status.replace("_", "-")}
            </span>
          </div>
          <p className="text-sm text-ds-text-secondary">
            {new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(appointment.starts_at))}
          </p>
          {appointment.notes ? <p className="text-sm text-ds-text-muted">{appointment.notes}</p> : null}
          <Link
            href="/dashboard/appointments"
            className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent"
          >
            View in Appointments
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
        <h3 className="text-sm font-medium text-ds-text-primary">Conversation</h3>
        <p className="text-xs text-ds-text-muted">Channel: {channelLabel(conversation.source)}</p>
        <p className="text-xs text-ds-text-muted">Started: {new Date(conversation.created_at).toLocaleString("en-US")}</p>
        <p className="text-xs text-ds-text-muted">
          {messageCount} message{messageCount === 1 ? "" : "s"}
        </p>
        {conversation.needs_attention ? (
          <p className="text-xs font-medium text-ds-warning">Needs attention</p>
        ) : null}
      </div>
    </div>
  );
}
