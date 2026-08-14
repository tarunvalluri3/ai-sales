import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listProductsForBusiness } from "@/lib/products";
import { listServicesForBusiness } from "@/lib/services";
import { listFaqsForBusiness } from "@/lib/faqs";
import { listKnowledgeDocumentsForBusiness } from "@/lib/knowledge";
import { listLeadsForBusiness } from "@/lib/leads";
import { listConversationsForBusiness, countConversationsNeedingAttention } from "@/lib/conversations";
import { getConversationVolumeStats, getLeadStats } from "@/lib/analytics";
import { KpiTile } from "./_components/kpi-tile";
import { ContentSummary } from "./_components/content-summary";
import { PipelinePanel } from "./_components/pipeline-panel";
import { RecentActivity } from "./_components/recent-activity";
import { QuickActions } from "./_components/quick-actions";
import { QualificationDonut } from "./_components/charts/qualification-donut";

const RECENT_LIMIT = 5;

export default async function DashboardOverviewPage() {
  const { businessId, businessName } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [
    products,
    services,
    faqs,
    knowledgeDocuments,
    leads,
    conversations,
    conversationStats,
    leadStats,
    needsAttentionCount,
  ] = await Promise.all([
    listProductsForBusiness(businessId),
    listServicesForBusiness(businessId),
    listFaqsForBusiness(businessId),
    listKnowledgeDocumentsForBusiness(businessId),
    listLeadsForBusiness(businessId),
    listConversationsForBusiness(supabase, businessId),
    getConversationVolumeStats(supabase, businessId),
    getLeadStats(supabase, businessId),
    countConversationsNeedingAttention(supabase, businessId),
  ]);

  const conversionRate =
    conversationStats.total === 0 ? 0 : Math.round((leadStats.total / conversationStats.total) * 100);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">{businessName}</h1>
        <p className="text-sm text-ds-text-secondary">
          {conversationStats.last7Days} conversation{conversationStats.last7Days === 1 ? "" : "s"} in
          the last 7 days · {leadStats.total} lead{leadStats.total === 1 ? "" : "s"} total
          {needsAttentionCount > 0
            ? ` · ${needsAttentionCount} need${needsAttentionCount === 1 ? "s" : ""} attention now`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Conversations"
          value={conversationStats.total}
          hint={`${conversationStats.last30Days} in the last 30 days`}
          href="/dashboard/conversations"
        />
        <KpiTile label="Leads" value={leadStats.total} href="/dashboard/leads" />
        <KpiTile
          label="Conversion rate"
          value={conversionRate}
          suffix="%"
          hint="Leads / conversations"
          href="/dashboard/analytics"
        />
        <KpiTile
          label="Needs attention"
          value={needsAttentionCount}
          hint="Conversations awaiting a human"
          href="/dashboard/conversations"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RecentActivity conversations={conversations.slice(0, RECENT_LIMIT)} leads={leads.slice(0, RECENT_LIMIT)} />
        <PipelinePanel byStatus={leadStats.byStatus} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Lead qualification</h2>
          <QualificationDonut byQualification={leadStats.byQualification} />
        </section>
        <ContentSummary
          items={[
            { label: "Products", count: products.length, href: "/dashboard/products" },
            { label: "Services", count: services.length, href: "/dashboard/services" },
            { label: "FAQs", count: faqs.length, href: "/dashboard/faqs" },
            {
              label: "Knowledge documents",
              count: knowledgeDocuments.length,
              href: "/dashboard/knowledge",
            },
          ]}
        />
        <QuickActions />
      </div>
    </div>
  );
}
