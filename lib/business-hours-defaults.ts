import type { BusinessHours } from "@/lib/supabase/types";

/**
 * The week every NEW business starts with (2026-11-20): Monday to Friday
 * 09:00-18:00 open, Saturday and Sunday closed, read in the business's own
 * time zone (`businesses.timezone`). Saved as real `business_hours` rows at
 * creation (lib/business.ts createBusinessForOrg), so the "Business hours
 * configured" readiness item is already done and booking has open slots
 * straight after publishing. The owner can change it at any time.
 *
 * Pure, so the form's fallback display and the unit tests use the same week.
 * Indexed like `business_hours.day_of_week` (0 = Sunday).
 */
export type DefaultDayHours = { dayOfWeek: number; isOpen: boolean; startTime: string | null; endTime: string | null };

export const DEFAULT_OPEN_TIME = "09:00";
export const DEFAULT_CLOSE_TIME = "18:00";

export function defaultWeeklyHours(): DefaultDayHours[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const isOpen = dayOfWeek >= 1 && dayOfWeek <= 5;
    return {
      dayOfWeek,
      isOpen,
      startTime: isOpen ? DEFAULT_OPEN_TIME : null,
      endTime: isOpen ? DEFAULT_CLOSE_TIME : null,
    };
  });
}

export function weekFromBusinessHours(hours: BusinessHours[]): DefaultDayHours[] {
  if (!hours.length) return defaultWeeklyHours();
  return defaultWeeklyHours().map((day) => {
    const saved = hours.find((row) => row.day_of_week === day.dayOfWeek);
    return {
      dayOfWeek: day.dayOfWeek,
      isOpen: saved?.is_open ?? false,
      startTime: saved?.start_time?.slice(0, 5) ?? null,
      endTime: saved?.end_time?.slice(0, 5) ?? null,
    };
  });
}
