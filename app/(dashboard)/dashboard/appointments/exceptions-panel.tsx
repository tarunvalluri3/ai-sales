"use client";

import { useActionState, useState } from "react";
import { createExceptionAction, deleteExceptionAction, type ExceptionActionState } from "./exceptions-actions";
import type { BusinessHoursException } from "@/lib/supabase/types";
import { CalendarDays, Info, Plus } from "lucide-react";
import { DeleteButton, ROLE_DENIED_TITLE } from "../_components/delete-button";
import { btnPrimary, helpClass, inputClass, labelClass } from "../_components/ui";

const initialState: ExceptionActionState = {};

const inputClasses = inputClass;

const MODE_HINT: Record<"close_all_day" | "close_range" | "open_override", string> = {
  close_range: "Block a specific time range, such as a lunch break.",
  open_override: "Open extra or different hours on this date. Overrides normal hours.",
  close_all_day: "Close the whole date, such as a public holiday.",
};

type Mode = "close_all_day" | "close_range" | "open_override";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "close_range", label: "Close part of the date" },
  { value: "open_override", label: "Open extra or different hours" },
  { value: "close_all_day", label: "Close the whole date" },
];

function describeException(exception: BusinessHoursException): string {
  if (exception.is_closed) {
    return exception.start_time && exception.end_time
      ? `Closed ${exception.start_time.slice(0, 5)}–${exception.end_time.slice(0, 5)}`
      : "Closed all day";
  }
  return `Open ${exception.start_time?.slice(0, 5)}–${exception.end_time?.slice(0, 5)} (overrides normal hours)`;
}

/**
 * Admin-only, same org:admin gate as the quick day-close toggle above it
 * on the Availability page. For anything that toggle can't do -- a
 * partial-day range (lunch break) or an exceptional opening -- pick a
 * date and what changes. One override per date; editing means deleting
 * and re-adding. No outer card here: the Availability page wraps this in
 * its own "Advanced overrides" card.
 */
export function ExceptionsPanel({ exceptions, canEdit }: { exceptions: BusinessHoursException[]; canEdit: boolean }) {
  const [createState, createFormAction, isCreating] = useActionState(createExceptionAction, initialState);
  const [mode, setMode] = useState<Mode>("close_range");
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <form action={createFormAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exception-date" className={labelClass}>
            Date
          </label>
          <input
            id="exception-date"
            name="date"
            type="date"
            min={todayKey}
            required
            disabled={isCreating || !canEdit}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exception-mode" className={labelClass}>
            What changes
          </label>
          <select
            id="exception-mode"
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
            disabled={isCreating || !canEdit}
            className={inputClasses}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className={helpClass}>{MODE_HINT[mode]}</p>
        </div>

        {mode !== "close_all_day" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="exception-start" className={labelClass}>
                From
              </label>
              <input
                id="exception-start"
                name="startTime"
                type="time"
                required
                disabled={isCreating || !canEdit}
                className={inputClasses}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="exception-end" className={labelClass}>
                To
              </label>
              <input
                id="exception-end"
                name="endTime"
                type="time"
                required
                disabled={isCreating || !canEdit}
                className={inputClasses}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exception-reason" className={labelClass}>
            Reason <span className="font-normal text-ds-text-secondary">(optional · staff only)</span>
          </label>
          <input
            id="exception-reason"
            name="reason"
            type="text"
            maxLength={200}
            placeholder="e.g. Public holiday"
            disabled={isCreating || !canEdit}
            className={inputClasses}
          />
        </div>

        <button
          type="submit"
          disabled={isCreating || !canEdit}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className={`${btnPrimary} mt-1 w-full`}
        >
          <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />
          {isCreating ? "Adding…" : "Add override"}
        </button>
      </form>

      {createState.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {createState.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-ds-border pt-4">
        <h3 className="text-sm font-medium text-ds-text-primary">Upcoming overrides</h3>
        {exceptions.length === 0 ? (
          <p className="py-2 text-sm text-ds-text-secondary">No upcoming overrides.</p>
        ) : (
          <ul className="dx-rows flex flex-col">
            {exceptions.map((exception) => (
              <li key={exception.id} className="flex items-center gap-3 py-3">
                <CalendarDays className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-ds-text-primary">
                    {new Date(`${exception.date}T00:00:00`).toLocaleDateString("en-US", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {describeException(exception)}
                  </span>
                  {exception.reason ? <span className="text-xs text-ds-text-secondary">{exception.reason}</span> : null}
                </div>
                <DeleteButton action={deleteExceptionAction} id={exception.id} canEdit={canEdit} variant="icon" label="Delete override" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-center gap-2 text-sm text-ds-text-secondary">
        <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Overrides apply to appointment availability.
      </p>
    </div>
  );
}
