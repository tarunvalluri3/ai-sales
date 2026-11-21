"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatMonthDay,
  formatTime,
  formatWeekdayDay,
} from "@/lib/format-business-time";

type BusinessTime = {
  timezone: string;
  dateTime: (value: string | number | Date) => string;
  date: (value: string | number | Date) => string;
  monthDay: (value: string | number | Date) => string;
  time: (value: string | number | Date) => string;
  weekdayDay: (value: string | number | Date) => string;
  calendarDate: (ymd: string) => string;
};

const BusinessTimeContext = createContext<BusinessTime | null>(null);

/**
 * Hands the business time zone (read on the server from the session's own
 * business row) to client components, so every date and time in the dashboard
 * is formatted by lib/format-business-time.ts in that zone.
 */
export function BusinessTimeProvider({ timezone, children }: { timezone: string; children: ReactNode }) {
  const value = useMemo<BusinessTime>(
    () => ({
      timezone,
      dateTime: (v) => formatDateTime(v, timezone),
      date: (v) => formatDate(v, timezone),
      monthDay: (v) => formatMonthDay(v, timezone),
      time: (v) => formatTime(v, timezone),
      weekdayDay: (v) => formatWeekdayDay(v, timezone),
      calendarDate: (ymd) => formatCalendarDate(ymd, timezone),
    }),
    [timezone],
  );
  return <BusinessTimeContext.Provider value={value}>{children}</BusinessTimeContext.Provider>;
}

export function useBusinessTime(): BusinessTime {
  const value = useContext(BusinessTimeContext);
  if (!value) throw new Error("useBusinessTime must be used inside BusinessTimeProvider");
  return value;
}
