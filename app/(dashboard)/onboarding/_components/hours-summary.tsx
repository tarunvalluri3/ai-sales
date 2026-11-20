import { BusinessHoursForm } from "../../dashboard/business-hours/business-hours-form";
import { summarizeSavedHours } from "@/lib/business-hours-summary";
import type { BusinessHours } from "@/lib/supabase/types";

export function HoursSummary({ hours, timezone, slaMinutes }: {
  hours: BusinessHours[];
  timezone: string;
  slaMinutes: number | null;
}) {
  return (
    <details className="border-t border-ds-border pt-4">
      <summary className="cursor-pointer text-sm font-medium text-ds-text-primary">
        {summarizeSavedHours(hours, timezone)} · Edit
      </summary>
      <div className="pt-4">
        <BusinessHoursForm hours={hours} slaMinutes={slaMinutes} timezone={timezone} embedded />
      </div>
    </details>
  );
}
