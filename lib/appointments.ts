import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Appointment, AppointmentBlockedSlot, BusinessHours, BusinessHoursException } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors";

type ServerSupabaseClient = ReturnType<typeof createServerSupabaseClient>;
type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;
/** Either client works for every read/write below -- the dashboard uses the Clerk-session client (RLS-scoped), the AI tools use the service-role client (same split as lib/business-hours.ts / lib/tools/request-callback.ts). */
type AnySupabaseClient = ServerSupabaseClient | ServiceSupabaseClient;

/** No slot within this many minutes of "now" is ever offered or accepted -- avoids offering a slot starting in 2 minutes. */
const MIN_LEAD_MINUTES = 60;
const MAX_DAYS_AHEAD = 14;
export const DEFAULT_DAYS_AHEAD = 7;
const MAX_SLOTS_RETURNED = 15;

export type AvailableSlot = { startsAt: string; endsAt: string; label: string };

/**
 * Converts a wall-clock date/time in `timeZone` to the UTC instant it
 * represents. Single-pass offset calculation -- the same Intl-based
 * technique lib/business-hours.ts's `isWithinBusinessHours` already uses
 * for the reverse direction. Accurate for virtually every real booking; a
 * slot landing exactly on a DST transition instant could be off by the
 * transition's delta -- an accepted v1 edge case, not silently assumed
 * away (no timezone library was added for this -- matches this project's
 * "no new dependency unless justified" pattern).
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asIfUtcInZone = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asIfUtcInZone - asUtc;
  return new Date(asUtc - offset);
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The calendar date + day-of-week `instant` falls on, read in `timeZone` -- not the UTC calendar date. */
function calendarDateInZone(instant: Date, timeZone: string): { year: number; month: number; day: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    dayOfWeek: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

/** The wall-clock minute-of-day `instant` falls on, read in `timeZone`. */
function minuteOfDayInZone(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  const parts = formatter.formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Shared date/time label formatter -- used both when offering a slot (this file) and when notifying a prospect of a status change (lib/appointment-notifications.ts). */
export function formatSlotLabel(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAt);
}

/** Subtracts `block` from every range in `windows`, splitting a range in two if the block falls in its middle (e.g. a lunch break inside a full-day window). */
function subtractRange(windows: [number, number][], block: [number, number]): [number, number][] {
  const result: [number, number][] = [];
  for (const [start, end] of windows) {
    if (block[1] <= start || block[0] >= end) {
      result.push([start, end]);
      continue;
    }
    if (block[0] > start) result.push([start, block[0]]);
    if (block[1] < end) result.push([block[1], end]);
  }
  return result;
}

/**
 * Resolves the open minute-of-day window(s) for one calendar date, folding
 * in a `business_hours_exceptions` override if one exists for that date:
 * a whole-day closure clears every window; a closure with a time range
 * subtracts just that window (may split one open range into two); an
 * exceptional opening (`is_closed: false`) replaces the day's normal
 * hours entirely with the override's own range, regardless of what
 * `business_hours` says for that weekday -- this is what lets a normally-
 * closed day be opened for one date. No exception row leaves the normal
 * `business_hours` result untouched, so existing behavior is unchanged.
 */
function resolveDayWindows(dayHours: BusinessHours | undefined, exception: BusinessHoursException | undefined): [number, number][] {
  let windows: [number, number][] =
    dayHours && dayHours.is_open && dayHours.start_time && dayHours.end_time
      ? [[timeStringToMinutes(dayHours.start_time), timeStringToMinutes(dayHours.end_time)]]
      : [];

  if (!exception) return windows;

  if (exception.is_closed) {
    if (exception.start_time && exception.end_time) {
      windows = subtractRange(windows, [timeStringToMinutes(exception.start_time), timeStringToMinutes(exception.end_time)]);
    } else {
      windows = [];
    }
  } else if (exception.start_time && exception.end_time) {
    windows = [[timeStringToMinutes(exception.start_time), timeStringToMinutes(exception.end_time)]];
  }

  return windows;
}

type AvailabilitySettings = { timezone: string; appointment_slot_minutes: number; appointments_enabled: boolean };

async function getAvailabilitySettings(supabase: AnySupabaseClient, businessId: string): Promise<AvailabilitySettings | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select("timezone, appointment_slot_minutes, appointments_enabled")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getWeeklyHours(supabase: AnySupabaseClient, businessId: string): Promise<Map<number, BusinessHours>> {
  const { data } = await supabase.from("business_hours").select("*").eq("business_id", businessId);
  return new Map((data ?? []).map((row) => [row.day_of_week, row]));
}

async function getExceptionsInRange(
  supabase: AnySupabaseClient,
  businessId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<Map<string, BusinessHoursException>> {
  const { data } = await supabase
    .from("business_hours_exceptions")
    .select("*")
    .eq("business_id", businessId)
    .gte("date", fromDateKey)
    .lte("date", toDateKey);
  return new Map((data ?? []).map((row) => [row.date, row]));
}

async function getExceptionForDate(supabase: AnySupabaseClient, businessId: string, key: string): Promise<BusinessHoursException | undefined> {
  const { data } = await supabase.from("business_hours_exceptions").select("*").eq("business_id", businessId).eq("date", key).maybeSingle();
  return data ?? undefined;
}

async function getBlockedTimesInRange(
  supabase: AnySupabaseClient,
  businessId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<Set<number>> {
  const { data } = await supabase
    .from("appointment_blocked_slots")
    .select("starts_at")
    .eq("business_id", businessId)
    .gte("starts_at", rangeStartIso)
    .lt("starts_at", rangeEndIso);
  return new Set((data ?? []).map((row) => new Date(row.starts_at).getTime()));
}

async function isSlotBlocked(supabase: AnySupabaseClient, businessId: string, startsAtIso: string): Promise<boolean> {
  const { data } = await supabase
    .from("appointment_blocked_slots")
    .select("id")
    .eq("business_id", businessId)
    .eq("starts_at", startsAtIso)
    .maybeSingle();
  return !!data;
}

/**
 * Generates this business's open, unbooked appointment slots for the next
 * `daysAhead` calendar days, sliced from its existing recurring
 * `business_hours` (lib/business-hours.ts) into `appointment_slot_minutes`
 * -long slots, in the business's own timezone. Excludes any slot already
 * held by a pending/confirmed appointment, and anything starting within
 * `MIN_LEAD_MINUTES`. Returns `[]` for a business with appointments
 * disabled or no configured hours -- unlike `isWithinBusinessHours`'s
 * "no rows = always open" default (built for SLA routing), an unconfigured
 * schedule must never silently offer 24/7 booking.
 */
export async function generateAvailableSlots(
  supabase: AnySupabaseClient,
  businessId: string,
  daysAhead: number = DEFAULT_DAYS_AHEAD,
): Promise<AvailableSlot[]> {
  const cappedDaysAhead = Math.min(Math.max(Math.trunc(daysAhead), 1), MAX_DAYS_AHEAD);

  const settings = await getAvailabilitySettings(supabase, businessId);
  if (!settings || !settings.appointments_enabled) return [];

  const hoursByDay = await getWeeklyHours(supabase, businessId);
  if (hoursByDay.size === 0) return [];

  const now = Date.now();
  const rangeStart = new Date(now + MIN_LEAD_MINUTES * 60 * 1000);
  const rangeEnd = new Date(now + (cappedDaysAhead + 1) * 24 * 60 * 60 * 1000);

  const { data: held, error: heldError } = await supabase
    .from("appointments")
    .select("starts_at")
    .eq("business_id", businessId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", rangeStart.toISOString())
    .lt("starts_at", rangeEnd.toISOString());

  if (heldError) {
    throw new AppError(
      "Something went wrong checking availability. Please try again.",
      "generateAvailableSlots: held lookup failed",
      heldError,
    );
  }

  const heldTimes = new Set((held ?? []).map((row) => new Date(row.starts_at).getTime()));
  const blockedTimes = await getBlockedTimesInRange(supabase, businessId, rangeStart.toISOString(), rangeEnd.toISOString());
  const slotMinutes = settings.appointment_slot_minutes;
  const slots: AvailableSlot[] = [];

  const rangeStartKey = (() => {
    const { year, month, day } = calendarDateInZone(new Date(now), settings.timezone);
    return dateKey(year, month, day);
  })();
  const rangeEndKey = (() => {
    const { year, month, day } = calendarDateInZone(new Date(now + cappedDaysAhead * 24 * 60 * 60 * 1000), settings.timezone);
    return dateKey(year, month, day);
  })();
  const exceptionsByDate = await getExceptionsInRange(supabase, businessId, rangeStartKey, rangeEndKey);

  for (let dayOffset = 0; dayOffset <= cappedDaysAhead && slots.length < MAX_SLOTS_RETURNED; dayOffset++) {
    const candidate = new Date(now + dayOffset * 24 * 60 * 60 * 1000);
    const { year, month, day, dayOfWeek } = calendarDateInZone(candidate, settings.timezone);
    const dayHours = hoursByDay.get(dayOfWeek);
    const windows = resolveDayWindows(dayHours, exceptionsByDate.get(dateKey(year, month, day)));
    if (windows.length === 0) continue;

    for (const [windowStart, windowEnd] of windows) {
      for (
        let minute = windowStart;
        minute + slotMinutes <= windowEnd && slots.length < MAX_SLOTS_RETURNED;
        minute += slotMinutes
      ) {
        const startsAt = zonedTimeToUtc(year, month, day, Math.floor(minute / 60), minute % 60, settings.timezone);
        if (startsAt < rangeStart || heldTimes.has(startsAt.getTime()) || blockedTimes.has(startsAt.getTime())) continue;

        const endsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000);
        slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), label: formatSlotLabel(startsAt, settings.timezone) });
      }
    }
  }

  return slots;
}

/**
 * Re-validates a specific slot server-side before booking it -- never
 * trusts the model to have copied a real, still-open slot verbatim from a
 * prior `check_available_slots` result. Checks the requested instant
 * against this one calendar day's hours directly (not by re-walking every
 * day, so it isn't limited by generateAvailableSlots's MAX_SLOTS_RETURNED
 * cap), then confirms nothing already holds it. The database's own partial
 * unique index (`appointments_active_slot_idx`) is the final backstop
 * against a race between this check and the insert below.
 */
export async function isSlotAvailable(supabase: AnySupabaseClient, businessId: string, startsAtIso: string): Promise<boolean> {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return false;
  if (startsAt.getTime() < Date.now() + MIN_LEAD_MINUTES * 60 * 1000) return false;

  const settings = await getAvailabilitySettings(supabase, businessId);
  if (!settings || !settings.appointments_enabled) return false;

  const { year, month, day, dayOfWeek } = calendarDateInZone(startsAt, settings.timezone);
  const { data: dayHours } = await supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", businessId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  const exception = await getExceptionForDate(supabase, businessId, dateKey(year, month, day));
  const windows = resolveDayWindows(dayHours ?? undefined, exception);

  const slotMinutes = settings.appointment_slot_minutes;
  const requestedMinute = minuteOfDayInZone(startsAt, settings.timezone);

  const fitsAWindow = windows.some(
    ([windowStart, windowEnd]) =>
      requestedMinute >= windowStart &&
      requestedMinute + slotMinutes <= windowEnd &&
      (requestedMinute - windowStart) % slotMinutes === 0,
  );
  if (!fitsAWindow) return false;

  const { data: existing } = await supabase
    .from("appointments")
    .select("id")
    .eq("business_id", businessId)
    .in("status", ["pending", "confirmed"])
    .eq("starts_at", startsAt.toISOString())
    .maybeSingle();

  if (existing) return false;

  return !(await isSlotBlocked(supabase, businessId, startsAt.toISOString()));
}

export type SlotGridState = "open" | "blocked" | "booked_pending" | "booked_confirmed" | "past";

export type SlotGridEntry = { startsAt: string; endsAt: string; label: string; state: SlotGridState };

/**
 * The admin-facing counterpart to generateAvailableSlots() (2026-09-10
 * follow-up, for the visual slot-grid UI): returns *every* slot for one
 * calendar date -- not just the open ones -- each classified by what's
 * actually happening at that instant, so the dashboard can show a real
 * calendar rather than only a list of what's bookable. Deliberately
 * ignores `appointments_enabled` (unlike generateAvailableSlots, which
 * must return [] when booking is off for prospects) -- an admin should
 * still be able to view and pre-block slots while booking is toggled
 * off, e.g. setting up availability before turning it on.
 */
export async function getSlotGridForDate(supabase: AnySupabaseClient, businessId: string, dateKeyStr: string): Promise<SlotGridEntry[]> {
  const settings = await getAvailabilitySettings(supabase, businessId);
  if (!settings) return [];

  const [year, month, day] = dateKeyStr.split("-").map(Number);
  if (!year || !month || !day) return [];

  // A calendar date's weekday is timezone-independent once year/month/day
  // are already known -- no need to round-trip through the business's
  // timezone the way calendarDateInZone() does for an instant.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const hoursByDay = await getWeeklyHours(supabase, businessId);
  const exception = await getExceptionForDate(supabase, businessId, dateKeyStr);
  const windows = resolveDayWindows(hoursByDay.get(dayOfWeek), exception);
  if (windows.length === 0) return [];

  const dayStartUtc = zonedTimeToUtc(year, month, day, 0, 0, settings.timezone);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: appts }, { data: blocked }] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, status")
      .eq("business_id", businessId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", dayStartUtc.toISOString())
      .lt("starts_at", dayEndUtc.toISOString()),
    supabase
      .from("appointment_blocked_slots")
      .select("starts_at")
      .eq("business_id", businessId)
      .gte("starts_at", dayStartUtc.toISOString())
      .lt("starts_at", dayEndUtc.toISOString()),
  ]);

  const apptStatusByTime = new Map((appts ?? []).map((row) => [new Date(row.starts_at).getTime(), row.status as Appointment["status"]]));
  const blockedTimes = new Set(((blocked ?? []) as Pick<AppointmentBlockedSlot, "starts_at">[]).map((row) => new Date(row.starts_at).getTime()));
  const leadCutoff = Date.now() + MIN_LEAD_MINUTES * 60 * 1000;
  const slotMinutes = settings.appointment_slot_minutes;

  const entries: SlotGridEntry[] = [];
  for (const [windowStart, windowEnd] of windows) {
    for (let minute = windowStart; minute + slotMinutes <= windowEnd; minute += slotMinutes) {
      const startsAt = zonedTimeToUtc(year, month, day, Math.floor(minute / 60), minute % 60, settings.timezone);
      const endsAt = new Date(startsAt.getTime() + slotMinutes * 60 * 1000);
      const time = startsAt.getTime();
      const apptStatus = apptStatusByTime.get(time);

      let state: SlotGridState;
      if (apptStatus === "confirmed") state = "booked_confirmed";
      else if (apptStatus === "pending") state = "booked_pending";
      else if (blockedTimes.has(time)) state = "blocked";
      else if (time < leadCutoff) state = "past";
      else state = "open";

      entries.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), label: formatSlotLabel(startsAt, settings.timezone), state });
    }
  }

  return entries;
}

export type CreateAppointmentInput = {
  conversationId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  startsAt: string;
  slotMinutes: number;
};

/**
 * Inserts a new appointment, always `status: 'pending'` -- the user's
 * confirmed choice: booking always requires owner approval, the AI never
 * confirms one directly. Returns `null` (rather than throwing) on the one
 * expected race -- the partial unique index rejecting a slot someone else
 * just took between `isSlotAvailable`'s check and this insert -- so the
 * caller can report "no longer available" instead of a generic failure.
 */
export async function createAppointment(supabase: AnySupabaseClient, businessId: string, input: CreateAppointmentInput): Promise<Appointment | null> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + input.slotMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      business_id: businessId,
      conversation_id: input.conversationId,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      notes: input.notes,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    // Postgres unique_violation -- the slot was taken by a concurrent
    // request between isSlotAvailable's check and this insert.
    if (error.code === "23505") return null;
    throw new AppError("Something went wrong booking this appointment. Please try again.", "createAppointment failed", error);
  }

  return data;
}

/** Loads one appointment, tenant-scoped. Used to gather contact/timing details for the confirm/decline/cancel notification (lib/appointment-notifications.ts) after the status transition itself has already succeeded. */
export async function getAppointmentForBusiness(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<Appointment | null> {
  const { data, error } = await supabase.from("appointments").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();

  if (error) {
    throw new AppError("Something went wrong loading this appointment. Please try again.", "getAppointmentForBusiness failed", error);
  }

  return data;
}

/** Lists a business's appointments, most recently starting first. `businessId` must come from `requireBusinessContext()`. */
export async function listAppointmentsForBusiness(supabase: ServerSupabaseClient, businessId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("business_id", businessId)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new AppError("Something went wrong loading appointments. Please try again.", "listAppointmentsForBusiness failed", error);
  }

  return data;
}

async function transitionAppointment(
  supabase: ServerSupabaseClient,
  businessId: string,
  id: string,
  fromStatuses: Appointment["status"][],
  toStatus: Appointment["status"],
): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: toStatus })
    .eq("business_id", businessId)
    .eq("id", id)
    .in("status", fromStatuses)
    .select("id");

  if (error) {
    throw new AppError("Something went wrong updating this appointment. Please try again.", "transitionAppointment failed", error);
  }

  return (data?.length ?? 0) > 0;
}

/** Owner approves a pending AI-booked appointment. */
export async function confirmAppointment(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<boolean> {
  return transitionAppointment(supabase, businessId, id, ["pending"], "confirmed");
}

/** Owner declines a pending appointment -- frees the slot back up immediately (declined rows fall outside the active-slot unique index). */
export async function declineAppointment(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<boolean> {
  return transitionAppointment(supabase, businessId, id, ["pending"], "declined");
}

/** Owner cancels a previously confirmed appointment. */
export async function cancelAppointment(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<boolean> {
  return transitionAppointment(supabase, businessId, id, ["confirmed"], "cancelled");
}

/** Owner marks a confirmed appointment as having actually happened, once its time has passed. */
export async function markAppointmentCompleted(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<boolean> {
  return transitionAppointment(supabase, businessId, id, ["confirmed"], "completed");
}

/** Owner marks a confirmed appointment as a no-show, once its time has passed. */
export async function markAppointmentNoShow(supabase: ServerSupabaseClient, businessId: string, id: string): Promise<boolean> {
  return transitionAppointment(supabase, businessId, id, ["confirmed"], "no_show");
}
