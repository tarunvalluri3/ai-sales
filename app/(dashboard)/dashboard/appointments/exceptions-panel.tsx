"use client";

import { useActionState, useState } from "react";
import { createExceptionAction, deleteExceptionAction, type ExceptionActionState } from "./exceptions-actions";
import type { BusinessHoursException } from "@/lib/supabase/types";
import { DeleteButton, ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: ExceptionActionState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong disabled:opacity-60";

type Mode = "close_all_day" | "close_range" | "open_override";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "close_range", label: "Close part of the date (e.g. a lunch break)" },
  { value: "open_override", label: "Open extra/different hours on this date" },
  { value: "close_all_day", label: "Close the whole date (e.g. a holiday)" },
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
 * and re-adding. No outer card here -- this lives inside the page's own
 * `<details>` disclosure, not a second nested container.
 */
export function ExceptionsPanel({ exceptions, canEdit }: { exceptions: BusinessHoursException[]; canEdit: boolean }) {
  const [createState, createFormAction, isCreating] = useActionState(createExceptionAction, initialState);
  const [mode, setMode] = useState<Mode>("close_range");
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <form action={createFormAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="exception-date" className="text-xs font-medium text-ds-text-secondary">
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

        <div className="flex flex-col gap-1">
          <label htmlFor="exception-mode" className="text-xs font-medium text-ds-text-secondary">
            What changes
          </label>
          <select
            id="exception-mode"
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
            disabled={isCreating || !canEdit}
            className={`${inputClasses} min-w-[16rem]`}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {mode !== "close_all_day" ? (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="exception-start" className="text-xs font-medium text-ds-text-secondary">
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
            <div className="flex flex-col gap-1">
              <label htmlFor="exception-end" className="text-xs font-medium text-ds-text-secondary">
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
          </>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor="exception-reason" className="text-xs font-medium text-ds-text-secondary">
            Reason (optional, staff-only)
          </label>
          <input
            id="exception-reason"
            name="reason"
            type="text"
            maxLength={200}
            placeholder="e.g. Public holiday"
            disabled={isCreating || !canEdit}
            className={`${inputClasses} min-w-[14rem]`}
          />
        </div>

        <button
          type="submit"
          disabled={isCreating || !canEdit}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isCreating ? "Adding…" : "Add override"}
        </button>
      </form>

      {createState.error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {createState.error}
        </p>
      ) : null}

      {exceptions.length === 0 ? (
        <p className="text-sm text-ds-text-muted">No upcoming overrides.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ds-border">
          {exceptions.map((exception) => (
            <li key={exception.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ds-text-primary">
                  {new Date(`${exception.date}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {describeException(exception)}
                </span>
                {exception.reason ? <span className="text-xs text-ds-text-muted">{exception.reason}</span> : null}
              </div>
              <DeleteButton action={deleteExceptionAction} id={exception.id} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
