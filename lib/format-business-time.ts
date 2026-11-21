/**
 * One date/time format for the whole dashboard, always in the BUSINESS time
 * zone (businesses.timezone), never the server's (UTC on Vercel) or the
 * browser's. Pure: no server-only import, so server pages, client components
 * and the unit tests all share it.
 *
 *   Indian zones -> en-IN: "21 Nov 2026, 3:49 pm"
 *   everything else -> en-US: "Nov 21, 2026, 3:49 PM"
 *
 * The month is always a name (never "11/20/2026", which reads as 11 Nov or
 * 20 Nov depending on the reader). An unknown zone falls back to UTC rather
 * than throwing: a bad stored value must not take a page down.
 */

const INDIAN_ZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

export function localeForTimezone(timezone: string): "en-IN" | "en-US" {
  return INDIAN_ZONES.has(timezone) ? "en-IN" : "en-US";
}

function safeZone(timezone: string | null | undefined): string {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

type Input = string | number | Date;

function toDate(value: Input): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(value: Input, timezone: string, options: Intl.DateTimeFormatOptions): string {
  const date = toDate(value);
  if (!date) return "";
  const zone = safeZone(timezone);
  return new Intl.DateTimeFormat(localeForTimezone(zone), { ...options, timeZone: zone }).format(date);
}

/** "21 Nov 2026, 3:49 pm" */
export function formatDateTime(value: Input, timezone: string): string {
  return format(value, timezone, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** "21 Nov 2026" */
export function formatDate(value: Input, timezone: string): string {
  return format(value, timezone, { day: "numeric", month: "short", year: "numeric" });
}

/** "21 Nov" (no year) */
export function formatMonthDay(value: Input, timezone: string): string {
  return format(value, timezone, { day: "numeric", month: "short" });
}

/** "3:49 pm" */
export function formatTime(value: Input, timezone: string): string {
  return format(value, timezone, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "Fri, 21 Nov" */
export function formatWeekdayDay(value: Input, timezone: string): string {
  return format(value, timezone, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * A calendar day stored as "YYYY-MM-DD" (availability dates, exceptions). It
 * has no time of day, so it is formatted as UTC (to keep any zone from
 * shifting the day) in the locale of the business zone.
 */
export function formatCalendarDate(ymd: string, timezone: string): string {
  const date = toDate(`${ymd}T00:00:00Z`);
  if (!date) return ymd;
  return new Intl.DateTimeFormat(localeForTimezone(safeZone(timezone)), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "Fri, 21 Nov, 3:49 pm" */
export function formatWeekdayDateTime(value: Input, timezone: string): string {
  return `${formatWeekdayDay(value, timezone)}, ${formatTime(value, timezone)}`;
}

/**
 * Billing periods, renewals and invoice dates are India-only for v1 and run
 * in IST, so the billing surfaces use this fixed zone (still through the same
 * formatter, so the shape matches every other date).
 */
export const BILLING_TIME_ZONE = "Asia/Kolkata";
