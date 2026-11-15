import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Info,
  Mail,
  Phone,
  Sparkles,
} from "lucide-react";
import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/customers";
import { listTagsForBusiness } from "@/lib/lead-tags";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import { LEAD_STATUS_LABEL } from "../../leads/lead-status";
import { channelLabel } from "@/lib/conversation-channel";
import { leadSourceLabel } from "@/lib/lead-source";
import { RemovableTagChip } from "../../_components/tag-chip";
import { TagPicker } from "../../_components/tag-picker";
import { Avatar, Card, ChannelIcon, Pill, linkAccent, type PillTone } from "../../_components/ui";
import { RenameCustomerForm } from "../rename-customer-form";
import { addTagToCustomerAction, removeTagFromCustomerAction } from "../actions";
import type { AppointmentStatus, LeadQualification } from "@/lib/supabase/types";

const QUALIFICATION_TONE: Record<LeadQualification, PillTone> = {
  hot: "solid",
  warm: "amber",
  cold: "gray",
};

const QUALIFICATION_LABEL: Record<LeadQualification, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
  expired: "Expired",
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}


export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId, orgRole } = await requireLiveBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:sales_agent");

  const [profile, allTags] = await Promise.all([getCustomerProfile(businessId, id), listTagsForBusiness(businessId)]);

  if (!profile) {
    notFound();
  }

  const { customer, leads, conversations, appointments, tags, scoreHistory } = profile;
  const latestLead = leads[0] ?? null;
  const availableTags = allTags.filter((tag) => !tags.some((applied) => applied.id === tag.id));
  const scorePercent = latestLead ? Math.max(0, Math.min(100, (latestLead.score / MAX_LEAD_SCORE) * 100)) : 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/customers"
          className="inline-flex w-fit items-center gap-2 rounded-md text-base text-ds-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          <ArrowLeft strokeWidth={1.75} className="size-4" aria-hidden="true" />
          Customers
        </Link>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={customer.display_name} size="2xl" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <RenameCustomerForm customerId={customer.id} displayName={customer.display_name} canEdit={canEdit} />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ds-text-primary">
              {customer.email ? (
                <span className="flex items-center gap-2.5">
                  <Mail className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {customer.email}
                </span>
              ) : null}
              {customer.email && customer.phone ? <span aria-hidden="true" className="h-5 w-px bg-ds-border-strong" /> : null}
              {customer.phone ? (
                <span className="flex items-center gap-2.5">
                  <Phone className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {customer.phone}
                </span>
              ) : null}
              {!customer.email && !customer.phone ? <span className="text-ds-text-secondary">No contact info</span> : null}
            </div>
            <p className="text-sm text-ds-text-secondary">
              First seen {formatDate(customer.first_seen_at)} · Last activity {formatDate(customer.last_activity_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h2 className="dx-title">Lead score</h2>
              {latestLead ? (
                <Pill tone={QUALIFICATION_TONE[latestLead.qualification]}>{QUALIFICATION_LABEL[latestLead.qualification]}</Pill>
              ) : null}
            </div>
            {latestLead ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-label text-3xl leading-none font-normal text-ds-text-primary">{latestLead.score}</span>
                  <span className="text-base leading-none font-medium text-ds-text-secondary">/ {MAX_LEAD_SCORE}</span>
                </p>
                <div
                  className="dx-track h-3"
                  role="img"
                  aria-label={`Lead score ${latestLead.score} out of ${MAX_LEAD_SCORE}`}
                >
                  <span style={{ width: `${scorePercent}%` }} />
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary">
                    <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <p className="text-sm leading-relaxed text-ds-text-primary">{latestLead.qualification_reason}</p>
                </div>
                <p className="text-sm text-ds-text-secondary">AI-assessed signal · Not verified</p>

                {scoreHistory.length > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-ds-border pt-4">
                    <h3 className="text-base font-medium text-ds-text-primary">Score history</h3>
                    <ol className="flex flex-col">
                      {scoreHistory.map((entry, index) => (
                        <li key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                          {index < scoreHistory.length - 1 ? (
                            <span aria-hidden="true" className="absolute top-5 bottom-0 left-[0.4375rem] w-px bg-ds-border-strong" />
                          ) : null}
                          <span
                            aria-hidden="true"
                            className={`relative mt-1.5 size-3.5 shrink-0 rounded-full ${
                              index === 0 ? "bg-ds-lime ring-4 ring-ds-lime-soft" : "bg-ds-mark-neutral"
                            }`}
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <p className="flex items-center gap-2 text-sm text-ds-text-primary">
                                <span className="font-medium">{entry.score}</span>
                                <span className="text-ds-text-secondary">/ {MAX_LEAD_SCORE} ·</span>
                                <Pill tone={QUALIFICATION_TONE[entry.qualification]} size="sm">
                                  {QUALIFICATION_LABEL[entry.qualification]}
                                </Pill>
                              </p>
                              <span className="text-sm text-ds-text-secondary">{formatDate(entry.created_at)}</span>
                            </div>
                            <ul className="flex flex-col text-sm text-ds-text-secondary">
                              {entry.reasons.map((reason, reasonIndex) => (
                                <li key={reasonIndex}>
                                  +{reason.points} {reason.label}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="flex items-center gap-2 border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
                      <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      Score changes are based on recorded events.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ds-text-secondary">No lead yet for this customer.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="dx-title">Tags</h2>
            <div className="flex flex-wrap items-center gap-2">
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
              {tags.length === 0 && !canEdit ? <span className="text-xs text-ds-text-secondary">No tags.</span> : null}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2">
            <h2 className="dx-title">Conversations ({conversations.length})</h2>
            {conversations.length === 0 ? (
              <p className="text-sm text-ds-text-secondary">No conversations yet.</p>
            ) : (
              <ul className="dx-rows flex flex-col">
                {conversations.map((conversation) => {
                  return (
                    <li key={conversation.id}>
                      <Link
                        href={`/dashboard/conversations/${conversation.id}`}
                        className="flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
                      >
                        <ChannelIcon source={conversation.source} className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-ds-text-primary">
                            {channelLabel(conversation.source)} conversation
                          </span>
                          <span className="text-sm text-ds-text-secondary">{formatDate(conversation.created_at)}</span>
                        </span>
                        {conversation.needs_attention ? (
                          <Pill tone="amber">Needs attention</Pill>
                        ) : conversation.control === "human" ? (
                          <Pill tone="lime">Human-controlled</Pill>
                        ) : (
                          <Pill tone="gray">AI-handled</Pill>
                        )}
                        <ChevronRight strokeWidth={1.75} className="size-5 shrink-0 text-ds-text-primary" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="dx-title">Appointments ({appointments.length})</h2>
            {appointments.length === 0 ? (
              <p className="text-sm text-ds-text-secondary">No appointments yet.</p>
            ) : (
              <ul className="dx-rows flex flex-col">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="text-sm flex items-center gap-4 px-3 py-3">
                    <CalendarDays className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm font-medium text-ds-text-primary">
                      {formatDate(appointment.starts_at)}
                    </span>
                    <Pill tone={APPOINTMENT_STATUS_TONE[appointment.status]}>{APPOINTMENT_STATUS_LABEL[appointment.status]}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="dx-title">Leads ({leads.length})</h2>
            {leads.length === 0 ? (
              <p className="text-sm text-ds-text-secondary">No leads yet.</p>
            ) : (
              <ul className="dx-rows flex flex-col">
                {leads.map((lead) => {
                  return (
                    <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
                      <ChannelIcon source={lead.source} className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} />
                      <span className="text-sm font-medium text-ds-text-primary">Enquiry · {leadSourceLabel(lead.source)}</span>
                      <Pill tone={QUALIFICATION_TONE[lead.qualification]} size="sm">
                        {QUALIFICATION_LABEL[lead.qualification]}
                      </Pill>
                      <span aria-hidden="true" className="h-6 w-px bg-ds-border-strong" />
                      <Pill tone={lead.status === "new" ? "lime" : "gray"} size="sm">
                        {LEAD_STATUS_LABEL[lead.status]}
                      </Pill>
                      <span className="ml-auto text-sm text-ds-text-secondary">{formatDate(lead.created_at)}</span>
                      <Link href={`/dashboard/conversations/${lead.conversation_id}`} className={linkAccent}>
                        View conversation
                        <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
