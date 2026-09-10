import Link from "next/link";
import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { getSlotGridForDate } from "@/lib/appointments";
import { listUpcomingBusinessHoursExceptions } from "@/lib/appointment-exceptions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppointmentsTabs } from "../appointments-tabs";
import { ExceptionsPanel } from "../exceptions-panel";
import { DayCloseToggle } from "./day-close-toggle";
import { SlotGrid } from "./slot-grid";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "Today," as a calendar date, in `timezone` -- en-CA conveniently formats as YYYY-MM-DD. */
function todayKeyInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Pure calendar-day arithmetic on a YYYY-MM-DD string -- no timezone conversion needed, just adding/subtracting whole days to the date itself. */
function shiftDateKey(dateKeyStr: string, days: number): string {
  const [year, month, day] = dateKeyStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export default async function AppointmentAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:admin");
  const supabase = createServerSupabaseClient();

  const business = await getBusinessForOrg(orgId);
  const timezone = business?.timezone ?? "UTC";
  const today = todayKeyInTimezone(timezone);

  const params = await searchParams;
  const date = params.date && DATE_KEY_PATTERN.test(params.date) && params.date >= today ? params.date : today;

  const [allEntries, exceptions] = await Promise.all([
    getSlotGridForDate(supabase, businessId, date),
    listUpcomingBusinessHoursExceptions(businessId),
  ]);

  const entries = allEntries.filter((entry) => entry.state !== "past");
  const todaysException = exceptions.find((exception) => exception.date === date);
  const isWholeDayClosed = Boolean(todaysException?.is_closed) && !todaysException?.start_time && !todaysException?.end_time;
  const hasPartialOverride = Boolean(todaysException) && !isWholeDayClosed;

  const prevDate = shiftDateKey(date, -1);
  const nextDate = shiftDateKey(date, 1);
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Appointments</h1>
        <AppointmentsTabs active="availability" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {date > today ? (
            <Link
              href={`?date=${prevDate}`}
              className="text-sm text-ds-text-secondary transition-colors hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              ← Prev
            </Link>
          ) : null}
          <span className="text-lg font-medium text-ds-text-primary">{dateLabel}</span>
          <Link
            href={`?date=${nextDate}`}
            className="text-sm text-ds-text-secondary transition-colors hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Next →
          </Link>
        </div>
        {hasPartialOverride ? (
          <span className="text-xs text-ds-text-muted">Custom override active — see Advanced below</span>
        ) : (
          <DayCloseToggle date={date} closedExceptionId={isWholeDayClosed ? (todaysException?.id ?? null) : null} canEdit={canEdit} />
        )}
      </div>

      <SlotGrid entries={entries} canEdit={canEdit} />

      <details className="group border-t border-ds-border pt-4">
        <summary className="cursor-pointer text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary [&::-webkit-details-marker]:hidden">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
          Advanced: lunch breaks, ranges, and exceptional openings
        </summary>
        <div className="mt-4">
          <ExceptionsPanel exceptions={exceptions} canEdit={canEdit} />
        </div>
      </details>
    </div>
  );
}
