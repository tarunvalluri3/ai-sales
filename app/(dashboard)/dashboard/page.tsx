import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listProductsForBusiness } from "@/lib/products";
import { listServicesForBusiness } from "@/lib/services";
import { listFaqsForBusiness } from "@/lib/faqs";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { listLeadsForBusiness } from "@/lib/leads";
import { countConversationsForBusiness } from "@/lib/conversations";
import { StatCard } from "./_components/stat-card";

export default async function DashboardOverviewPage() {
  const { businessId, businessName } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [products, services, faqs, knowledgeDocuments, leads, conversationCount] =
    await Promise.all([
      listProductsForBusiness(businessId),
      listServicesForBusiness(businessId),
      listFaqsForBusiness(businessId),
      listKnowledgeDocumentsForBusiness(businessId),
      listLeadsForBusiness(businessId),
      countConversationsForBusiness(supabase, businessId),
    ]);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">{businessName}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Products" count={products.length} href="/dashboard/products" />
        <StatCard label="Services" count={services.length} href="/dashboard/services" />
        <StatCard label="FAQs" count={faqs.length} href="/dashboard/faqs" />
        <StatCard
          label="Knowledge documents"
          count={knowledgeDocuments.length}
          href="/dashboard/knowledge"
        />
        <StatCard label="Leads" count={leads.length} href="/dashboard/leads" />
        {/*
         * Conversations has no dedicated page yet (Phase 13c) -- links to
         * Leads for now as the closest existing related view. Deliberate
         * temporary link, not a bug; update once 13c ships.
         */}
        <StatCard label="Conversations" count={conversationCount} href="/dashboard/leads" />
      </div>
    </div>
  );
}
