/**
 * Appointment reminder and expiry timing (production readiness, item 5).
 * Pure, no server-only import: the unit tests import it directly.
 *
 * Decisions (confirmed with the owner, 2026-11-03):
 *  - Reminders before a CONFIRMED appointment: 24 hours and 1 hour before.
 *  - A PENDING booking the owner never confirms expires 48 hours after it was
 *    made, or 2 hours before its start, whichever comes first.
 *    Edge case (implementation detail, flagged in LAUNCH_AUDIT.md): a booking
 *    made less than ~3 hours ahead would otherwise expire the moment it is
 *    made, so the owner always gets at least 1 hour (or until the start).
 *
 * All instants are absolute (Date / timestamptz). Time zones only matter
 * when a slot is shown to a person (formatSlotLabel in the business's zone),
 * so a reminder fires at the right moment for every zone, DST included.
 */

export type ReminderKind = "reminder_24h" | "reminder_1h";

type ReminderSpec = { kind: ReminderKind; leadMinutes: number; windowMinutes: number };

/**
 * A reminder is due from `leadMinutes` before the start until `windowMinutes`
 * later. The window lets a scheduler that runs every few minutes (or was
 * briefly down) still send it near the right time, and stops a reminder
 * firing absurdly late: an appointment confirmed 5 hours ahead gets no
 * "24-hour" reminder, only the 1-hour one.
 */
export const REMINDERS: readonly ReminderSpec[] = [
  { kind: "reminder_24h", leadMinutes: 24 * 60, windowMinutes: 4 * 60 },
  { kind: "reminder_1h", leadMinutes: 60, windowMinutes: 45 },
];

const MINUTE_MS = 60_000;

export function dueReminderKinds(startsAt: Date, now: Date): ReminderKind[] {
  const msToStart = startsAt.getTime() - now.getTime();
  if (msToStart <= 0) return [];
  return REMINDERS.filter((spec) => {
    const opensAt = spec.leadMinutes * MINUTE_MS;
    const closesAt = (spec.leadMinutes - spec.windowMinutes) * MINUTE_MS;
    return msToStart <= opensAt && msToStart > closesAt;
  }).map((spec) => spec.kind);
}

/** The starts_at range worth reading for reminders right now: (now + smallest close, now + largest lead]. */
export function reminderCandidateRange(now: Date): { from: Date; to: Date } {
  const closest = Math.min(...REMINDERS.map((spec) => spec.leadMinutes - spec.windowMinutes));
  const furthest = Math.max(...REMINDERS.map((spec) => spec.leadMinutes));
  return { from: new Date(now.getTime() + closest * MINUTE_MS), to: new Date(now.getTime() + furthest * MINUTE_MS) };
}

export const PENDING_EXPIRY = {
  expireAfterSeconds: 48 * 60 * 60,
  beforeStartSeconds: 2 * 60 * 60,
  minOwnerWindowSeconds: 60 * 60,
} as const;

/** When a pending booking expires. Same formula as expire_stale_pending_appointments() (migration 20261118000000). */
export function pendingExpiresAt(createdAt: Date, startsAt: Date): Date {
  const created = createdAt.getTime();
  const start = startsAt.getTime();
  const normal = Math.min(created + PENDING_EXPIRY.expireAfterSeconds * 1000, start - PENDING_EXPIRY.beforeStartSeconds * 1000);
  const floor = Math.min(created + PENDING_EXPIRY.minOwnerWindowSeconds * 1000, start);
  return new Date(Math.max(normal, floor));
}

export function isPendingExpired(createdAt: Date, startsAt: Date, now: Date): boolean {
  return now.getTime() >= pendingExpiresAt(createdAt, startsAt).getTime();
}
