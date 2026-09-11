import Link from "next/link";
import { AiSummaryCard } from "./ai-summary-card";
import { Badge } from "../../_components/badge";
import { channelLabel } from "@/lib/conversation-channel";
import type { Appointment, AppointmentStatus, Conversation, Lead, LeadQualification } from "@/lib/supabase/types";

const QUALIFICATION_TONE: Record<LeadQualification, "accent" | "success" | "muted"> = {
  hot: "accent",
  warm: "success",
  cold: "muted",
};

const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, "accent" | "success" | "danger" | "muted"> = {
  pending: "accent",
  confirmed: "success",
  declined: "danger",
  cancelled: "muted",
  completed: "success",
  no_show: "danger",
};

/**
 * The right-hand "useful info" pane of the conversation detail view --
 * everything the old page's single lead card showed, plus what it
 * didn't (appointment), plus the on-demand AI summary. Pure
 * server-rendered composition except `AiSummaryCard`, the one
 * interactive island.
 */
export function InfoPanel({
  conversation,
  lead,
  interestName,
  appointment,
  messageCount,
  timezone,
}: {
  conversation: Conversation;
  lead: Lead | null;
  interestName: string | null;
  appointment: Appointment | null;
  messageCount: number;
  timezone: string;
}) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
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
            <Badge tone={QUALIFICATION_TONE[lead.qualification]} title="AI-assessed signal -- not verified">
              {lead.qualification}
            </Badge>
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
            <Badge tone={APPOINTMENT_STATUS_TONE[appointment.status]}>{appointment.status.replace("_", "-")}</Badge>
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
