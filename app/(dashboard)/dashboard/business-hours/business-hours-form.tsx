"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Info, Lock } from "lucide-react";
import { updateBusinessHoursAction, type BusinessHoursState } from "./actions";
import type { BusinessHours } from "@/lib/supabase/types";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: BusinessHoursState = {};

/** Indexed by `business_hours.day_of_week` (0 = Sunday). */
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Display order: the working week first, Sunday last. Field names still carry the real day index. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const inputClasses =
  "h-10 rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 text-sm text-ds-text-primary disabled:bg-ds-surface-soft disabled:text-ds-text-muted";
const cardClasses = "dx-card dx-card-pad flex flex-col gap-3";

/**
 * `canEdit` (Phase P2#10, default `true`) disables every input/button
 * rather than replacing the whole form -- unlike a create form
 * (PermissionNotice), this form also displays the business's already-
 * configured hours, which a lower-role viewer should still be able to
 * see even though they can't change them.
 *
 * Laid out with container queries (`@container`), not viewport breakpoints:
 * the onboarding wizard renders this same form in a much narrower column,
 * where it must stay a single stack.
 */
export function BusinessHoursForm({
  hours,
  slaMinutes,
  timezone,
  canEdit = true,
  embedded = false,
}: {
  hours: BusinessHours[];
  slaMinutes: number | null;
  timezone: string;
  canEdit?: boolean;
  /** Set by the onboarding wizard: drops the dashboard-only extras (the link to appointment availability and the admins-only note). */
  embedded?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateBusinessHoursAction, initialState);

  const byDay = new Map(hours.map((row) => [row.day_of_week, row]));
  const [openDays, setOpenDays] = useState<boolean[]>(
    Array.from({ length: 7 }, (_, day) => byDay.get(day)?.is_open ?? hours.length === 0),
  );
  const [sla, setSla] = useState(slaMinutes === null ? "" : String(slaMinutes));
  const hasSavedHours = hours.length > 0;
  const timezoneOptions = TIMEZONE_OPTIONS.includes(timezone) ? TIMEZONE_OPTIONS : [timezone, ...TIMEZONE_OPTIONS];
  const disabled = isPending || !canEdit;
  const slaNumber = Number(sla);

  return (
    <form action={formAction} className="@container flex flex-col gap-4">
      {!hasSavedHours ? (
        <p role="alert" className="rounded-2xl bg-ds-warning-bg px-4 py-3 text-sm text-ds-warning">
          You haven&rsquo;t saved your business hours yet. Until you save, appointment booking will show no available times
          to prospects, even though this form displays default hours below.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={cardClasses}>
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Weekly schedule</h2>
            <p className="dx-subtitle text-base">These hours also determine appointment availability.</p>
          </div>

          <div className="dx-rows flex flex-col">
            {DISPLAY_ORDER.map((day) => {
              const existing = byDay.get(day);
              const isOpen = openDays[day];
              const label = DAY_LABELS[day];
              return (
                <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex w-56 cursor-pointer items-center gap-4">
                    <span className="w-28 text-sm font-medium text-ds-text-primary">{label}</span>
                    <span className="relative inline-flex">
                      <input
                        type="checkbox"
                        name={`day-${day}-open`}
                        defaultChecked={isOpen}
                        disabled={disabled}
                        aria-label={`${label} open`}
                        onChange={(event) =>
                          setOpenDays((prev) => prev.map((value, index) => (index === day ? event.target.checked : value)))
                        }
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
                      defaultValue={existing?.start_time?.slice(0, 5) ?? "09:00"}
                      disabled={disabled || !isOpen}
                      className={`${inputClasses} min-w-0 flex-1`}
                    />
                    <span className="text-sm text-ds-text-secondary">to</span>
                    <input
                      type="time"
                      name={`day-${day}-end`}
                      aria-label={`${label} closing time`}
                      defaultValue={existing?.end_time?.slice(0, 5) ?? "17:00"}
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
            A day switched off is closed. An unconfigured schedule is treated as always open.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <section className={cardClasses}>
            <label htmlFor="timezone" className="dx-title">
              Business timezone
            </label>
            <select id="timezone" name="timezone" defaultValue={timezone} disabled={disabled} className={`${inputClasses} w-full`}>
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="text-sm text-ds-text-secondary">All times in this schedule use this timezone.</p>
          </section>

          <section className={cardClasses}>
            <div className="flex flex-col gap-0.5">
              <h2 className="dx-title">Response target</h2>
              <p className="dx-subtitle">Re-route escalated conversations when your team hasn&rsquo;t responded.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="slaMinutes" className="text-sm font-medium text-ds-text-primary">
                SLA (minutes)
              </label>
              <div className="flex">
                <input
                  id="slaMinutes"
                  name="slaMinutes"
                  type="number"
                  min={1}
                  value={sla}
                  onChange={(event) => setSla(event.target.value)}
                  placeholder="Off"
                  disabled={disabled}
                  aria-describedby="slaMinutes-hint"
                  className={`${inputClasses} min-w-0 flex-1 rounded-r-none`}
                />
                <span className="inline-flex h-10 items-center rounded-r-xl border border-l-0 border-ds-border-strong bg-ds-surface-soft px-4 text-sm text-ds-text-primary">
                  min
                </span>
              </div>
              <p id="slaMinutes-hint" className="text-sm text-ds-text-secondary">
                Leave blank to disable automatic re-routing.
              </p>
            </div>
            {sla !== "" && Number.isFinite(slaNumber) && slaNumber > 0 ? (
              <p className="flex items-center gap-3 rounded-xl bg-ds-surface-soft px-4 py-3 text-sm text-ds-text-primary">
                <Clock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                After {slaNumber} minute{slaNumber === 1 ? "" : "s"} without a staff reply, an escalated conversation can be
                re-routed.
              </p>
            ) : null}
          </section>

          {embedded ? null : (
          <section className={cardClasses}>
            <h2 className="dx-title">Need an exception?</h2>
            <p className="dx-subtitle">Manage lunch breaks, holidays and one-off opening hours in appointment availability.</p>
            <Link
              href="/dashboard/appointments/availability"
              className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-ds-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              Manage availability
              <ArrowUpRight strokeWidth={1.75} className="size-5" aria-hidden="true" />
            </Link>
          </section>
          )}
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-2xl bg-ds-danger-bg px-4 py-3 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-2xl bg-ds-success-bg px-4 py-3 text-sm text-ds-success">
          Saved.
        </p>
      ) : null}

      <div className="dx-card flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <CalendarDays className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-ds-text-primary">
          Your saved schedule controls team hours and appointment availability.
        </p>
        <button
          type="submit"
          disabled={disabled}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="ds-btn-label inline-flex h-9 min-w-48 items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {embedded ? null : (
        <p className="flex items-center gap-3 px-2 text-sm text-ds-text-secondary">
          <Lock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Only organisation admins can change business hours.
        </p>
      )}
    </form>
  );
}
