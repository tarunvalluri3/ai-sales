import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customers";
import { listTagsForBusiness } from "@/lib/lead-tags";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import { LEAD_STATUS_LABEL } from "../../leads/lead-status";
import { channelLabel } from "@/lib/conversation-channel";
import { Badge, type BadgeTone } from "../../_components/badge";
import { RemovableTagChip } from "../../_components/tag-chip";
import { TagPicker } from "../../_components/tag-picker";
import { RenameCustomerForm } from "../rename-customer-form";
import { addTagToCustomerAction, removeTagFromCustomerAction } from "../actions";
import type { AppointmentStatus, LeadQualification } from "@/lib/supabase/types";

const QUALIFICATION_TONE: Record<LeadQualification, BadgeTone> = {
  hot: "accent",
  warm: "success",
  cold: "muted",
};

const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:sales_agent");

  const [profile, allTags] = await Promise.all([getCustomerProfile(businessId, id), listTagsForBusiness(businessId)]);

  if (!profile) {
    notFound();
  }

  const { customer, leads, conversations, appointments, tags, scoreHistory } = profile;
  const latestLead = leads[0] ?? null;
  const availableTags = allTags.filter((tag) => !tags.some((applied) => applied.id === tag.id));

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/customers" className="w-fit text-xs font-medium text-ds-text-muted hover:text-ds-text-primary">
          ← Customers
        </Link>
        <RenameCustomerForm customerId={customer.id} displayName={customer.display_name} canEdit={canEdit} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ds-text-secondary">
          {customer.email ? <span>{customer.email}</span> : null}
          {customer.phone ? <span>{customer.phone}</span> : null}
          {!customer.email && !customer.phone ? <span className="text-ds-text-muted">No contact info</span> : null}
        </div>
        <p className="text-xs text-ds-text-muted">
          First seen {formatDate(customer.first_seen_at)} · Last activity {formatDate(customer.last_activity_at)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ds-text-primary">Lead score</h2>
            {latestLead ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={QUALIFICATION_TONE[latestLead.qualification]}>{latestLead.qualification}</Badge>
                  <span className="text-sm text-ds-text-secondary">
                    {latestLead.score}/{MAX_LEAD_SCORE}
                  </span>
                </div>
                <p className="text-xs text-ds-text-muted">
                  {latestLead.qualification_reason}
                  <span className="ml-1 text-ds-text-muted">(AI-assessed signal, not verified — always confirm from the conversation itself.)</span>
                </p>
                {scoreHistory.length > 0 ? (
                  <div className="flex flex-col gap-1.5 border-t border-ds-border pt-3">
                    <span className="text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">
                      Deterministic score history
                    </span>
                    {scoreHistory.map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-0.5 text-xs">
                        <div className="flex items-center gap-2 text-ds-text-secondary">
                          <span className="font-medium text-ds-text-primary">{entry.score}</span>
                          <span>{entry.qualification}</span>
                          <span className="text-ds-text-muted">{formatDate(entry.created_at)}</span>
                        </div>
                        <ul className="ml-3 list-disc text-ds-text-muted">
                          {entry.reasons.map((reason, index) => (
                            <li key={index}>
                              +{reason.points} {reason.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ds-text-muted">No lead yet for this customer.</p>
            )}
          </section>

          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ds-text-primary">Conversations ({conversations.length})</h2>
            {conversations.length === 0 ? (
              <p className="text-sm text-ds-text-muted">No conversations yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/dashboard/conversations/${conversation.id}`}
                      className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 text-sm transition-colors hover:bg-ds-surface-soft"
                    >
                      <span className="text-ds-text-primary">{channelLabel(conversation.source)}</span>
                      <span className="flex items-center gap-2 text-xs text-ds-text-muted">
                        {conversation.needs_attention ? <Badge tone="warning" size="sm">Needs attention</Badge> : null}
                        {conversation.control === "human" ? <Badge tone="muted" size="sm">Human-controlled</Badge> : null}
                        {formatDate(conversation.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ds-text-primary">Appointments ({appointments.length})</h2>
            {appointments.length === 0 ? (
              <p className="text-sm text-ds-text-muted">No appointments yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 text-sm">
                    <span className="text-ds-text-primary">{formatDate(appointment.starts_at)}</span>
                    <Badge tone={appointment.status === "confirmed" || appointment.status === "completed" ? "success" : appointment.status === "declined" || appointment.status === "cancelled" || appointment.status === "no_show" ? "danger" : "warning"} size="sm">
                      {APPOINTMENT_STATUS_LABEL[appointment.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ds-text-primary">Tags</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <RemovableTagChip
                  key={tag.id}
                  tag={tag}
                  action={removeTagFromCustomerAction}
                  hiddenFields={{ customerId: customer.id, tagId: tag.id }}
                  canEdit={canEdit}
                />
              ))}
              {canEdit ? (
                <TagPicker availableTags={availableTags} action={addTagToCustomerAction} hiddenFields={{ customerId: customer.id }} />
              ) : null}
              {tags.length === 0 && !canEdit ? <span className="text-xs text-ds-text-muted">No tags.</span> : null}
            </div>
          </section>

          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ds-text-primary">Leads ({leads.length})</h2>
            {leads.length === 0 ? (
              <p className="text-sm text-ds-text-muted">No leads yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/dashboard/conversations/${lead.conversation_id}`}
                      className="flex flex-col gap-1 rounded-ds-sm px-2 py-1.5 transition-colors hover:bg-ds-surface-soft"
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={QUALIFICATION_TONE[lead.qualification]} size="sm">
                          {lead.qualification}
                        </Badge>
                        <span className="text-xs text-ds-text-secondary">{LEAD_STATUS_LABEL[lead.status]}</span>
                      </div>
                      <span className="text-2xs text-ds-text-muted">{formatDate(lead.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
