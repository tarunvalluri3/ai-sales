import { BusinessHoursForm } from "../../dashboard/business-hours/business-hours-form";
import { hasConfirmedBusinessHours } from "@/lib/business-hours-defaults";
import { summarizeSavedHours } from "@/lib/business-hours-summary";
import type { BusinessHours } from "@/lib/supabase/types";

export function HoursSummary({ hours, timezone, slaMinutes, useProfileTimezone }: {
  hours: BusinessHours[];
  timezone: string;
  slaMinutes: number | null;
  useProfileTimezone?: boolean;
}) {
  const confirmed = hasConfirmedBusinessHours(hours);
  return (
    <details id="opening-hours" open={!confirmed} className="scroll-mt-24">
      <summary className="dx-card cursor-pointer px-4 py-3 text-sm font-medium text-ds-text-primary">
        {confirmed ? summarizeSavedHours(hours, timezone) : "Default hours - confirm or edit"} · Edit
      </summary>
      <div className="pt-4">
        <BusinessHoursForm hours={hours} slaMinutes={slaMinutes} timezone={timezone} embedded useProfileTimezone={useProfileTimezone} />
      </div>
    </details>
  );
}
