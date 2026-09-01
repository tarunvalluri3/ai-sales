"use client";

import { useActionState } from "react";
import { updateAppointmentSettingsAction, type AppointmentSettingsState } from "./actions";

const initialState: AppointmentSettingsState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong disabled:opacity-60";

/**
 * Phase C: lets an owner turn on the AI's check_available_slots/
 * book_appointment tools and set how long each slot is. Slots are always
 * generated from the business hours set above -- there's no separate
 * availability calendar to configure.
 */
export function AppointmentSettingsForm({ enabled, slotMinutes }: { enabled: boolean; slotMinutes: number }) {
  const [state, formAction, isPending] = useActionState(updateAppointmentSettingsAction, initialState);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">Appointment booking</h2>
        <p className="text-sm text-ds-text-secondary">
          Let your AI sales employee offer real open times from the hours above and request an
          appointment. Every request needs your confirmation on the{" "}
          <a href="/dashboard/appointments" className="underline hover:text-ds-text-secondary">
            Appointments
          </a>{" "}
          page before it&rsquo;s booked.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-ds-text-primary">
        <input type="checkbox" name="appointmentsEnabled" defaultChecked={enabled} disabled={isPending} />
        Enable appointment booking
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="appointmentSlotMinutes" className="text-sm font-medium text-ds-text-secondary">
          Slot length (minutes)
        </label>
        <input
          id="appointmentSlotMinutes"
          name="appointmentSlotMinutes"
          type="number"
          min={5}
          max={240}
          defaultValue={slotMinutes}
          disabled={isPending}
          className={`${inputClasses} max-w-xs`}
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-ds-sm bg-ds-success-bg px-3 py-2 text-sm text-ds-success">Saved.</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
