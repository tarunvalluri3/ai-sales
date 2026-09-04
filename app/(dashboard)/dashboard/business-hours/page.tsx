import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { listBusinessHours } from "@/lib/business-hours";
import { BusinessHoursForm } from "./business-hours-form";

export default async function BusinessHoursPage() {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const [business, hours] = await Promise.all([getBusinessForOrg(orgId), listBusinessHours(businessId)]);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Business hours</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary">
          Set the hours your team is available, and how long an escalated conversation should wait
          before it&rsquo;s re-routed to the next team member. Leave a day off to mark it closed. An
          unconfigured schedule is treated as always open. These hours also drive appointment
          availability if you turn on appointment booking in{" "}
          <a href="/dashboard/widget-settings" className="underline hover:text-ds-text-secondary">
            AI capabilities
          </a>
          .
        </p>
      </div>

      <BusinessHoursForm
        hours={hours}
        slaMinutes={business?.sla_minutes ?? null}
        timezone={business?.timezone ?? "UTC"}
        canEdit={hasMinRole(orgRole, "org:admin")}
      />
    </div>
  );
}
