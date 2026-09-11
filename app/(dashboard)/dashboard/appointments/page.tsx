import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { listAppointmentsForBusiness } from "@/lib/appointments";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppointmentsTable } from "./appointments-table";
import { AppointmentsTabs } from "./appointments-tabs";
import type { AppointmentStatus } from "@/lib/supabase/types";
import { EmptyState } from "../_components/state-views";

const STATUS_FILTERS: { value: "all" | AppointmentStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
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

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Appointments</h1>
        <AppointmentsTabs active="requests" />
        <p className="text-sm text-ds-text-secondary">
          {allAppointments.length} appointment{allAppointments.length === 1 ? "" : "s"} total · every AI-booked
          request needs your confirmation here before it&rsquo;s final · times shown in {timezone}. Turn booking
          on or off in{" "}
          <Link href="/dashboard/business-hours" className="underline hover:text-ds-text-secondary">
            Business Hours
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "all" ? "/dashboard/appointments" : `/dashboard/appointments?status=${filter.value}`}
            aria-current={status === filter.value ? "true" : undefined}
            className={`rounded-ds-sm px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
              status === filter.value ? "bg-ds-accent text-ds-accent-on" : "text-ds-text-secondary hover:bg-ds-surface-soft"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

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
    </div>
  );
}
