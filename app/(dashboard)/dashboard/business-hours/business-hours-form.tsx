"use client";

import { useActionState, useState } from "react";
import { updateBusinessHoursAction, type BusinessHoursState } from "./actions";
import type { BusinessHours } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: BusinessHoursState = {};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong disabled:opacity-60";

/**
 * `canEdit` (Phase P2#10, default `true`) disables every input/button
 * rather than replacing the whole form -- unlike a create form
 * (PermissionNotice), this form also displays the business's already-
 * configured hours, which a lower-role viewer should still be able to
 * see even though they can't change them.
 */
export function BusinessHoursForm({
  hours,
  slaMinutes,
  timezone,
  canEdit = true,
}: {
  hours: BusinessHours[];
  slaMinutes: number | null;
  timezone: string;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateBusinessHoursAction, initialState);

  const byDay = new Map(hours.map((row) => [row.day_of_week, row]));
  const [openDays, setOpenDays] = useState<boolean[]>(
    Array.from({ length: 7 }, (_, day) => byDay.get(day)?.is_open ?? hours.length === 0),
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <p className="text-xs text-ds-text-muted">Times are in your business timezone ({timezone}).</p>

      <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        {DAY_LABELS.map((label, day) => {
          const existing = byDay.get(day);
          const isOpen = openDays[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 items-center gap-2 text-sm text-ds-text-primary">
                <input
                  type="checkbox"
                  name={`day-${day}-open`}
                  defaultChecked={isOpen}
                  disabled={isPending || !canEdit}
                  onChange={(event) =>
                    setOpenDays((prev) => prev.map((value, index) => (index === day ? event.target.checked : value)))
                  }
                />
                {label}
              </label>
              <input
                type="time"
                name={`day-${day}-start`}
                defaultValue={existing?.start_time?.slice(0, 5) ?? "09:00"}
                disabled={isPending || !isOpen || !canEdit}
                className={inputClasses}
              />
              <span className="text-sm text-ds-text-muted">to</span>
              <input
                type="time"
                name={`day-${day}-end`}
                defaultValue={existing?.end_time?.slice(0, 5) ?? "17:00"}
                disabled={isPending || !isOpen || !canEdit}
                className={inputClasses}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="slaMinutes" className="text-sm font-medium text-ds-text-secondary">
          SLA (minutes before an escalated conversation is re-routed)
        </label>
        <input
          id="slaMinutes"
          name="slaMinutes"
          type="number"
          min={1}
          defaultValue={slaMinutes ?? ""}
          placeholder="Leave blank to disable SLA routing"
          disabled={isPending || !canEdit}
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
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
