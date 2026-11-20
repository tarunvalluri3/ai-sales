"use client";

import { Info } from "lucide-react";
import type { DefaultDayHours } from "@/lib/business-hours-defaults";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const inputClasses = "h-10 rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 text-sm text-ds-text-primary disabled:bg-ds-surface-soft disabled:text-ds-text-muted";
const cardClasses = "dx-card dx-card-pad flex flex-col gap-3";

export function WeeklyHoursFields({ week, onChange, disabled }: {
  week: DefaultDayHours[];
  onChange: (week: DefaultDayHours[]) => void;
  disabled: boolean;
}) {
  function update(day: number, patch: Partial<DefaultDayHours>) {
    onChange(week.map((entry, index) => index === day ? { ...entry, ...patch } : entry));
  }

  return (
    <section className={cardClasses}>
      <div className="flex flex-col gap-0.5">
        <h2 className="dx-title">Weekly schedule</h2>
        <p className="dx-subtitle text-base">These hours also determine appointment availability.</p>
      </div>

      <div className="dx-rows flex flex-col">
        {DISPLAY_ORDER.map((day) => {
          const entry = week[day];
          const isOpen = entry.isOpen;
          const label = DAY_LABELS[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <label className="flex w-56 cursor-pointer items-center gap-4">
                <span className="w-28 text-sm font-medium text-ds-text-primary">{label}</span>
                <span className="relative inline-flex">
                  <input
                    type="checkbox"
                    name={`day-${day}-open`}
                    checked={isOpen}
                    disabled={disabled}
                    aria-label={`${label} open`}
                    onChange={(event) => update(day, { isOpen: event.target.checked })}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  <span aria-hidden="true" className="dx-switch" />
                </span>
                <span className="text-sm text-ds-text-primary">{isOpen ? "Open" : "Closed"}</span>
              </label>
              <div className="flex flex-1 items-center gap-3">
                <input
                  type="time"
                  name={`day-${day}-start`}
                  aria-label={`${label} opening time`}
                  value={entry.startTime ?? "09:00"}
                  onChange={(event) => update(day, { startTime: event.target.value })}
                  disabled={disabled || !isOpen}
                  className={`${inputClasses} min-w-0 flex-1`}
                />
                <span className="text-sm text-ds-text-secondary">to</span>
                <input
                  type="time"
                  name={`day-${day}-end`}
                  aria-label={`${label} closing time`}
                  value={entry.endTime ?? "18:00"}
                  onChange={(event) => update(day, { endTime: event.target.value })}
                  disabled={disabled || !isOpen}
                  className={`${inputClasses} min-w-0 flex-1`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-3 border-t border-ds-border pt-3 text-sm text-ds-text-secondary">
        <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        A day switched off is closed all day.
      </p>
    </section>
  );
}
