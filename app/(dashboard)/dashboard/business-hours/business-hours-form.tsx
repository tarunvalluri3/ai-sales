"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock, Lock } from "lucide-react";
import { updateBusinessHoursAction, type BusinessHoursState } from "./actions";
import type { BusinessHours } from "@/lib/supabase/types";
import { hasConfirmedBusinessHours, weekFromBusinessHours } from "@/lib/business-hours-defaults";
import { WeeklyHoursFields } from "./weekly-hours-fields";
import { TimezonePicker } from "../_components/timezone-picker";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: BusinessHoursState = {};

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
  useProfileTimezone = false,
}: {
  hours: BusinessHours[];
  slaMinutes: number | null;
  timezone: string;
  canEdit?: boolean;
  /** Set by the onboarding wizard: drops the dashboard-only extras (the link to appointment availability and the admins-only note). */
  embedded?: boolean;
  useProfileTimezone?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateBusinessHoursAction, initialState);

  const [week, setWeek] = useState(() => weekFromBusinessHours(hours));
  const [hoursEdited, setHoursEdited] = useState(false);
  const confirmed = state.success || hasConfirmedBusinessHours(hours);
  const [chosenZone, setZone] = useState<string | null>(null);
  const zone = useProfileTimezone ? timezone : chosenZone ?? timezone;
  const [sla, setSla] = useState(slaMinutes === null ? "" : String(slaMinutes));
  const hasSavedHours = hours.length > 0;
  const disabled = isPending || !canEdit;
  const slaNumber = Number(sla);

  return (
    <form action={formAction} className="@container flex flex-col gap-4">
      {!hasSavedHours ? (
        <p role="alert" className="rounded-2xl bg-ds-warning-bg px-4 py-3 text-sm text-ds-warning">
          No business hours are saved yet. Until you save: appointment booking offers prospects no times, and widget
          greetings and SLA alerts treat you as always open. The hours below are a suggestion until you save them.
        </p>
      ) : null}

      {embedded && !confirmed && <p className="text-sm text-ds-text-secondary">Confirm or edit these hours in {zone}.</p>}
      <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <WeeklyHoursFields week={week} disabled={disabled} onChange={(updatedWeek) => {
          setWeek(updatedWeek);
          setHoursEdited(true);
        }} />

        <div className="flex flex-col gap-4">
          {useProfileTimezone ? <input type="hidden" name="timezone" value={zone} /> : (
          <section className={cardClasses}>
            <label htmlFor="timezone" className="dx-title">
              Business timezone
            </label>
            <TimezonePicker
              id="timezone"
              name="timezone"
              value={zone}
              onChange={setZone}
              disabled={disabled}
              triggerClassName={`${inputClasses} w-full`}
            />
            <p className="text-sm text-ds-text-secondary">All times in this schedule use this timezone.</p>
          </section>
          )}

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
          {isPending ? "Saving…" : embedded && !confirmed && !hoursEdited ? "These are correct" : embedded ? "Save hours" : "Save"}
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
