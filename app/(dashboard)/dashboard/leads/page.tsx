import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listLeadsForBusiness, computePossibleDuplicateLeads } from "@/lib/leads";
import { listProductsByIds } from "@/lib/products";
import { listServicesByIds } from "@/lib/services";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LeadsList } from "./leads-list";

export default async function LeadsPage() {
  const { businessId, orgRole } = await requireBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:sales_agent");
  const leads = await listLeadsForBusiness(businessId);

  // Cross-channel identity hint (dashboard-only, no data merge -- see
  // lib/leads.ts's computePossibleDuplicateLeads doc comment): resolve
  // each lead's own conversation channel ("chat_widget" / "whatsapp") so
  // the hint can say *where* the other lead came from.
  const conversationIds = [...new Set(leads.map((lead) => lead.conversation_id))];
  const channelByConversationId: Record<string, string | null> = {};
  if (conversationIds.length > 0) {
    const supabase = createServerSupabaseClient();
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, source")
      .eq("business_id", businessId)
      .in("id", conversationIds);
    for (const conversation of conversations ?? []) {
      channelByConversationId[conversation.id] = conversation.source;
    }
  }
  const possibleDuplicatesByLeadId = computePossibleDuplicateLeads(leads, channelByConversationId);

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
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <LeadsList
        leads={leads}
        interestNameById={interestNameById}
        canEdit={canEdit}
        possibleDuplicatesByLeadId={possibleDuplicatesByLeadId}
      />
    </div>
  );
}
