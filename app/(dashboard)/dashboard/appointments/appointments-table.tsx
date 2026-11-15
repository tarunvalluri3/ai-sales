"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppointmentActions } from "./appointment-actions";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { ArrowUpRight, Ban, Check, Clock, X } from "lucide-react";
import { Avatar, Pill, linkAccent, type PillTone } from "../_components/ui";
import type { Appointment, AppointmentStatus } from "@/lib/supabase/types";
import { displayContactName } from "@/lib/lead-source";

const STATUS_TONE: Record<AppointmentStatus, PillTone> = {
  pending: "amber",
  confirmed: "lime",
  declined: "red",
  cancelled: "gray",
  completed: "solid",
  no_show: "red",
  expired: "gray",
};

const STATUS_ICON: Record<AppointmentStatus, typeof Check> = {
  pending: Clock,
  confirmed: Check,
  declined: X,
  cancelled: Ban,
  completed: Check,
  no_show: X,
  expired: Clock,
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
  expired: "Expired",
};

const COLUMNS: DataTableColumn[] = [
  { key: "starts_at", label: "Date & time", width: "minmax(11rem,1.1fr)", sortable: true },
  { key: "contact", label: "Contact", width: "minmax(14rem,1.5fr)" },
  { key: "status", label: "Status", width: "9.5rem" },
  { key: "notes", label: "Notes", width: "minmax(10rem,1.6fr)" },
  { key: "actions", label: "Actions", width: "minmax(16rem,1.4fr)" },
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
        day: "numeric",
        month: "short",
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
      renderRow={(appointment) => {
        const StatusIcon = STATUS_ICON[appointment.status];
        return (
          <TableRow>
            <TableCell>
              <span className="text-sm text-ds-text-primary">{formatter.format(new Date(appointment.starts_at))}</span>
            </TableCell>
            <TableCell className="min-w-0 gap-3">
              <Avatar name={appointment.contact_name} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-ds-text-primary">{displayContactName(appointment.contact_name) ?? "Unnamed prospect"}</span>
                <span className="truncate text-xs text-ds-text-secondary">{appointment.contact_email ?? "—"}</span>
                <span className="truncate text-xs text-ds-text-secondary">{appointment.contact_phone ?? "—"}</span>
              </span>
            </TableCell>
            <TableCell>
              <Pill tone={STATUS_TONE[appointment.status]}>
                <StatusIcon className="size-3.5" aria-hidden="true" />
                {STATUS_LABEL[appointment.status]}
              </Pill>
            </TableCell>
            <TableCell className="min-w-0">
              {appointment.notes ? (
                <p className="line-clamp-2 text-ds-text-primary" title={appointment.notes}>
                  {appointment.notes}
                </p>
              ) : (
                <span className="text-ds-text-muted">—</span>
              )}
            </TableCell>
            <TableCell className="flex-wrap gap-x-4 gap-y-2">
              <AppointmentActions
                id={appointment.id}
                status={appointment.status}
                isPastDue={new Date(appointment.starts_at).getTime() < now}
                canEdit={canEdit}
              />
              {appointment.conversation_id ? (
                <Link href={`/dashboard/conversations/${appointment.conversation_id}`} className={linkAccent}>
                  View conversation
                  <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </TableCell>
          </TableRow>
        );
      }}
    />
  );
}
