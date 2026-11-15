import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { listBusinessHours } from "@/lib/business-hours";
import { BusinessHoursForm } from "./business-hours-form";
import { Clock } from "lucide-react";
import { PageHeader } from "../_components/ui";

export default async function BusinessHoursPage() {
  const { businessId, orgId, orgRole } = await requireBusinessContext();
  const [business, hours] = await Promise.all([getBusinessForOrg(orgId), listBusinessHours(businessId)]);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader icon={Clock} title="Business hours" description="Set when your team is available and how escalations are handled." />

      <BusinessHoursForm
        hours={hours}
        slaMinutes={business?.sla_minutes ?? null}
        timezone={business?.timezone ?? "UTC"}
        canEdit={hasMinRole(orgRole, "org:admin")}
      />
    </div>
  );
}
