import { formatCalendarDate } from "@/lib/format-business-time";
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
import { ArrowUpRight, ChevronLeft, ChevronRight, Globe, Info } from "lucide-react";
import { Card, InfoBanner, PageHeader, Pill, btnGhost, linkAccent } from "../../_components/ui";

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
  const dateLabel = formatCalendarDate(date, timezone);
  const relativeLabel = date === today ? "Today" : date === shiftDateKey(today, 1) ? "Tomorrow" : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        title="Appointments"
        description="Control when prospects can book time with your team."
        actions={
          <span className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-ds-border bg-ds-surface px-4 text-sm font-medium text-ds-text-primary">
            <Globe className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {timezone}
          </span>
        }
      />
      <AppointmentsTabs active="availability" />

      <InfoBanner icon={Info}>
        Slots follow your Business Hours.{" "}
        <Link href="/dashboard/business-hours" className={linkAccent}>
          Manage schedule
          <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
        </Link>
      </InfoBanner>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4">
          <h2 className="dx-title">Daily availability</h2>

          <div className="flex items-center justify-between gap-3">
            {date > today ? (
              <Link href={`?date=${prevDate}`} className={btnGhost}>
                <ChevronLeft strokeWidth={1.75} className="size-4" aria-hidden="true" />
                Prev
              </Link>
            ) : (
              <span aria-hidden="true" className="w-24" />
            )}
            <div className="flex flex-col items-center text-center">
              <span className="text-lg font-medium text-ds-text-primary">{dateLabel}</span>
              {relativeLabel ? <span className="text-sm text-ds-text-secondary">{relativeLabel}</span> : null}
            </div>
            <Link href={`?date=${nextDate}`} className={btnGhost}>
              Next
              <ChevronRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="flex flex-col gap-2 border-b border-ds-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {isWholeDayClosed ? (
                <Pill tone="gray" dot className="h-10 px-4 text-sm font-medium">
                  Closed for bookings
                </Pill>
              ) : (
                <Pill tone="lime" dot className="h-10 px-4 text-sm font-medium">
                  Open for bookings
                </Pill>
              )}
              {hasPartialOverride ? (
                <span className="text-sm text-ds-text-secondary">Custom override active. See Advanced overrides.</span>
              ) : (
                <DayCloseToggle date={date} closedExceptionId={isWholeDayClosed ? (todaysException?.id ?? null) : null} canEdit={canEdit} />
              )}
            </div>
            <p className="text-sm text-ds-text-secondary">Close the whole day, or block individual slots below.</p>
          </div>

          <SlotGrid entries={entries} canEdit={canEdit} />
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Advanced overrides</h2>
            <p className="dx-subtitle">Breaks, exceptional hours, and closed days.</p>
          </div>
          <ExceptionsPanel exceptions={exceptions} canEdit={canEdit} />
        </Card>
      </div>
    </div>
  );
}
