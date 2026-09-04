import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { listAppointmentsForBusiness } from "@/lib/appointments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppointmentActions } from "./appointment-actions";
import type { AppointmentStatus } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: "bg-ds-accent-soft-bg text-ds-accent-muted",
  confirmed: "bg-ds-success-bg text-ds-success",
  declined: "bg-ds-danger-bg text-ds-danger",
  cancelled: "bg-ds-surface-soft text-ds-text-muted",
};

export default async function AppointmentsPage() {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const supabase = createServerSupabaseClient();
  const [business, appointments] = await Promise.all([
    getBusinessForOrg(orgId),
    listAppointmentsForBusiness(supabase, businessId),
  ]);
  const timezone = business?.timezone ?? "UTC";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Appointments</h1>
        <p className="text-sm text-ds-text-secondary">
          {appointments.length} appointment{appointments.length === 1 ? "" : "s"} total · every AI-booked
          request needs your confirmation here before it&rsquo;s final · times shown in {timezone}. Turn
          booking on or off in{" "}
          <Link href="/dashboard/business-hours" className="underline hover:text-ds-text-secondary">
            Business Hours
          </Link>
          .
        </p>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Once appointment booking is enabled and a prospect books a time, requests show up here for your confirmation."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4 transition-colors hover:border-ds-border-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ds-text-primary">{formatter.format(new Date(appointment.starts_at))}</p>
                    <span
                      className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase ${STATUS_STYLE[appointment.status]}`}
                    >
                      {appointment.status}
                    </span>
                  </div>
                  <p className="text-sm text-ds-text-secondary">
                    {appointment.contact_name ?? "Unnamed prospect"} · {appointment.contact_email ?? "—"} ·{" "}
                    {appointment.contact_phone ?? "—"}
                  </p>
                  {appointment.notes ? <p className="text-sm text-ds-text-muted">{appointment.notes}</p> : null}
                </div>
                <AppointmentActions id={appointment.id} status={appointment.status} canEdit={canEdit} />
              </div>
              {appointment.conversation_id ? (
                <div className="border-t border-ds-border pt-3">
                  <Link
                    href={`/dashboard/conversations/${appointment.conversation_id}`}
                    className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                  >
                    View conversation
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
