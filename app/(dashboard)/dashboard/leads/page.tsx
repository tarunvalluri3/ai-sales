import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listLeadsForBusiness } from "@/lib/leads";
import { listProductsByIds } from "@/lib/products";
import { listServicesByIds } from "@/lib/services";
import { LeadsList } from "./leads-list";

export default async function LeadsPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:sales_agent");
  const leads = await listLeadsForBusiness(businessId);

  // Resolved to real names rather than shown as raw ids -- a lead's
  // matched product/service can be edited or deleted after the lead was
  // created, so an id that no longer resolves honestly says "no longer
  // available" instead of guessing (/impeccable clarify, following the
  // same fix already made on the conversation detail page's lead card).
  const productIds: string[] = [];
  const serviceIds: string[] = [];
  for (const lead of leads) {
    if (!lead.interest_id) continue;
    if (lead.interest_type === "product") productIds.push(lead.interest_id);
    else if (lead.interest_type === "service") serviceIds.push(lead.interest_id);
  }
  const [interestProducts, interestServices] = await Promise.all([
    listProductsByIds(businessId, productIds),
    listServicesByIds(businessId, serviceIds),
  ]);
  const interestNameById: Record<string, string> = {};
  for (const product of interestProducts) interestNameById[product.id] = product.name;
  for (const service of interestServices) interestNameById[service.id] = service.name;

  return (
    <div className="flex flex-1 flex-col bg-ds-bg p-6">
      <LeadsList leads={leads} interestNameById={interestNameById} canEdit={canEdit} />
    </div>
  );
}
