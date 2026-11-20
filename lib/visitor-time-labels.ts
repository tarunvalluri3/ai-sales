/**
 * Widget reliability item 3 (STATE.md 2026-11-20): adds the visitor's own
 * local time to the scheduling tools' results, so the model can write
 * "10:00 AM IST (11:30 PM Fri, your time)" without converting anything itself.
 *
 * DISPLAY ONLY. `visitorTimeZone` is the browser's zone, validated by
 * normalizeTimezone() in the route; it never changes which slots exist, which
 * slot is booked, or anything about the tenant -- it only appends a label.
 * Pure, no I/O.
 */
import { visitorLocalTimeLabel } from "@/lib/timezones";

type SlotsResult =
  | { found: true; timezone: string; slots: { startsAt: string; label: string }[] }
  | { found: false; reason: string };

export function addVisitorLabelsToSlots<T extends SlotsResult>(result: T, visitorTimeZone: string | null): T {
  if (!visitorTimeZone || !result.found) return result;
  return {
    ...result,
    slots: result.slots.map((slot) => {
      const visitorLabel = visitorLocalTimeLabel(new Date(slot.startsAt), visitorTimeZone, result.timezone);
      return visitorLabel ? { ...slot, visitorLabel } : slot;
    }),
  };
}

type BookingResult = { success: true; label: string } | { success: false };

export function addVisitorLabelToBooking<T extends BookingResult>(
  result: T,
  startsAt: unknown,
  visitorTimeZone: string | null,
  businessTimeZone: string | null,
): T {
  if (!visitorTimeZone || !businessTimeZone || !result.success || typeof startsAt !== "string") return result;
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return result;
  const visitorLabel = visitorLocalTimeLabel(at, visitorTimeZone, businessTimeZone);
  return visitorLabel ? { ...result, visitorLabel } : result;
}
