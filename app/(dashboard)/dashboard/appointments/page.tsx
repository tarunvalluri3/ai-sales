import { formatTime, formatWeekdayDay } from "@/lib/format-business-time";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Globe, Mail, MessageCircle, Phone } from "lucide-react";
import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { listAppointmentsForBusiness } from "@/lib/appointments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppointmentsTable } from "./appointments-table";
import { AppointmentsTabs } from "./appointments-tabs";
import { AppointmentActions } from "./appointment-actions";
import type { AppointmentStatus } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";
import { Avatar, Card, PageHeader, Pill, linkAccent } from "../_components/ui";
import { displayContactName } from "@/lib/lead-source";

const STATUS_FILTERS: { value: "all" | AppointmentStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

/** How many pending requests get a full card above the table; the rest stay in the table's Pending filter. */
const PENDING_CARD_LIMIT = 6;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { businessId, orgId, orgRole } = await requireLiveBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const supabase = createServerSupabaseClient();
  const [business, allAppointments] = await Promise.all([
    getBusinessForOrg(orgId),
    listAppointmentsForBusiness(supabase, businessId),
  ]);
  const timezone = business?.timezone ?? "UTC";

  const params = await searchParams;
  const status = params.status ?? "all";
  const appointments = status === "all" ? allAppointments : allAppointments.filter((appointment) => appointment.status === status);
  // `new Date()`, not the bare `Date.now()` call react-hooks/purity rejects
  // inside a Server Component's render body -- same established workaround
  // as business-hours-form.tsx/exceptions-panel.tsx elsewhere in this app.
  const now = new Date();

  const countByStatus = new Map<string, number>();
  for (const appointment of allAppointments) {
    countByStatus.set(appointment.status, (countByStatus.get(appointment.status) ?? 0) + 1);
  }
  const pending = allAppointments.filter((appointment) => appointment.status === "pending");
  const dayFormatter = { format: (date: Date) => formatWeekdayDay(date, timezone) };
  const timeFormatter = { format: (date: Date) => formatTime(date, timezone) };

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="Appointments"
        description="Review requests. Confirm the next conversation."
        actions={
          <span className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-text-primary">
            <Globe className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {timezone}
          </span>
        }
      />
      <AppointmentsTabs active="requests" />

      <div className="flex items-center gap-4 rounded-2xl bg-ds-surface-soft px-5 py-3.5">
        <CalendarCheck className="size-5 shrink-0 text-ds-primary" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex min-w-0 flex-col border-l border-ds-primary/20 pl-4">
          <p className="text-sm font-medium text-ds-text-primary">
            Every AI-booked request needs your confirmation before it is final.
          </p>
          <p className="text-sm text-ds-text-secondary">
            Times shown in {timezone} · Manage booking in{" "}
            <Link href="/dashboard/business-hours" className={linkAccent}>
              Business Hours
              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </div>

      {pending.length > 0 ? (
        <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 id="pending-heading" className="dx-title">
              Awaiting your confirmation
            </h2>
            <Pill tone="amber">{pending.length}</Pill>
          </div>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {pending.slice(0, PENDING_CARD_LIMIT).map((appointment) => {
              const startsAt = new Date(appointment.starts_at);
              return (
                <Card as="li" key={appointment.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col">
                      <p className="text-xs font-medium tracking-[0.08em] text-ds-text-primary uppercase">
                        {dayFormatter.format(startsAt)}
                      </p>
                      <p className="font-label text-3xl leading-tight font-normal text-ds-text-primary">
                        {timeFormatter.format(startsAt)}
                      </p>
                    </div>
                    <Pill tone="amber">Pending</Pill>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar name={appointment.contact_name} size="lg" />
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-sm font-medium text-ds-text-primary">
                        {displayContactName(appointment.contact_name) ?? "Unnamed prospect"}
                      </p>
                      <p className="flex items-center gap-2 text-sm text-ds-text-primary">
                        <Mail className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">{appointment.contact_email ?? "—"}</span>
                      </p>
                      <p className="flex items-center gap-2 text-sm text-ds-text-primary">
                        <Phone className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">{appointment.contact_phone ?? "—"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 border-t border-ds-border pt-3">
                    {appointment.notes ? (
                      <p className="flex items-start gap-2.5 text-sm text-ds-text-primary">
                        <MessageCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className="line-clamp-3">{appointment.notes}</span>
                      </p>
                    ) : null}
                    {appointment.conversation_id ? (
                      <Link href={`/dashboard/conversations/${appointment.conversation_id}`} className={`${linkAccent} pl-6.5`}>
                        View conversation
                        <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                  <AppointmentActions
                    layout="card"
                    id={appointment.id}
                    status={appointment.status}
                    isPastDue={startsAt.getTime() < now.getTime()}
                    canEdit={canEdit}
                  />
                </Card>
              );
            })}
          </ul>
          {pending.length > PENDING_CARD_LIMIT ? (
            <p className="text-sm text-ds-text-secondary">
              Showing the next {PENDING_CARD_LIMIT} of {pending.length} pending requests.{" "}
              <Link href="/dashboard/appointments?status=pending" className={linkAccent}>
                See all pending
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="dx-title">All appointments</h2>
          <Pill tone="gray">{allAppointments.length} total</Pill>
        </div>

        <nav aria-label="Filter appointments by status" className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((filter) => {
            const active = status === filter.value;
            const count = filter.value === "all" ? allAppointments.length : (countByStatus.get(filter.value) ?? 0);
            return (
              <Link
                key={filter.value}
                href={filter.value === "all" ? "/dashboard/appointments" : `/dashboard/appointments?status=${filter.value}`}
                aria-current={active ? "true" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary ${
                  active
                    ? "bg-ds-lime-soft font-medium text-ds-primary"
                    : "border border-ds-border-strong bg-ds-surface text-ds-text-primary hover:bg-ds-surface-soft"
                }`}
              >
                {filter.label}
                <span className="tabular-nums">{count}</span>
              </Link>
            );
          })}
        </nav>

        {appointments.length === 0 ? (
          <EmptyState
            title="No appointments"
            description={
              status === "all"
                ? "Once appointment booking is enabled and a prospect books a time, requests show up here for your confirmation."
                : "No appointments currently match this filter."
            }
          />
        ) : (
          <AppointmentsTable appointments={appointments} timezone={timezone} canEdit={canEdit} now={now.getTime()} />
        )}
      </Card>
    </div>
  );
}
