"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppointmentActions } from "./appointment-actions";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import type { Appointment, AppointmentStatus } from "@/lib/supabase/types";

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: "bg-ds-accent-soft-bg text-ds-accent-muted",
  confirmed: "bg-ds-success-bg text-ds-success",
  declined: "bg-ds-danger-bg text-ds-danger",
  cancelled: "bg-ds-surface-soft text-ds-text-muted",
  completed: "bg-ds-success-bg text-ds-success",
  no_show: "bg-ds-danger-bg text-ds-danger",
};

const COLUMNS: DataTableColumn[] = [
  { key: "starts_at", label: "Date & time", width: "1.6fr", sortable: true },
  { key: "contact", label: "Contact", width: "1.6fr" },
  { key: "status", label: "Status", width: "130px" },
  { key: "notes", label: "Notes", width: "2fr" },
  { key: "actions", label: "Actions", width: "220px", align: "right" },
];

/**
 * Client half of the Appointments "Requests" list -- the page itself
 * (page.tsx) stays a server component that fetches data server-side, same
 * server-fetches/client-renders split already used for Leads and
 * Conversations; this only owns the table's sort/pagination chrome.
 */
export function AppointmentsTable({
  appointments,
  timezone,
  canEdit,
  now,
}: {
  appointments: Appointment[];
  timezone: string;
  canEdit: boolean;
  now: number;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [timezone],
  );

  // Default order matches lib/appointments.ts's own listAppointmentsForBusiness
  // ordering (soonest first); clicking "Date & time" lets the admin flip it.
  const sortedAppointments = useMemo(() => {
    if (!sort) return appointments;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...appointments].sort(
      (a, b) => direction * (new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    );
  }, [appointments, sort]);

  return (
    <DataTable
      items={sortedAppointments}
      columns={COLUMNS}
      getRowId={(appointment) => appointment.id}
      sort={sort}
      onSortChange={setSort}
      caption="Appointment requests"
      renderRow={(appointment) => (
        <TableRow>
          <TableCell direction="col" className="gap-0.5">
            <span className="font-medium text-ds-text-primary">{formatter.format(new Date(appointment.starts_at))}</span>
            {appointment.conversation_id ? (
              <Link
                href={`/dashboard/conversations/${appointment.conversation_id}`}
                className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                View conversation
              </Link>
            ) : null}
          </TableCell>
          <TableCell direction="col" className="gap-0.5">
            <span className="text-ds-text-primary">{appointment.contact_name ?? "Unnamed prospect"}</span>
            <span className="text-xs text-ds-text-muted">
              {appointment.contact_email ?? "—"} · {appointment.contact_phone ?? "—"}
            </span>
          </TableCell>
          <TableCell>
            <span
              className={`rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase ${STATUS_STYLE[appointment.status]}`}
            >
              {appointment.status.replace("_", "-")}
            </span>
          </TableCell>
          <TableCell className="min-w-0">
            {appointment.notes ? (
              <p className="truncate text-ds-text-secondary" title={appointment.notes}>
                {appointment.notes}
              </p>
            ) : (
              <span className="text-ds-text-muted">—</span>
            )}
          </TableCell>
          <TableCell align="right">
            <AppointmentActions
              id={appointment.id}
              status={appointment.status}
              isPastDue={new Date(appointment.starts_at).getTime() < now}
              canEdit={canEdit}
            />
          </TableCell>
        </TableRow>
      )}
    />
  );
}
