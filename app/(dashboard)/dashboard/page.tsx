import { headers } from "next/headers";
import { listWidgetKeysForBusiness } from "@/lib/widget-keys";
import { buildWidgetSnippet } from "./widget-settings/build-widget-snippet";
import { LaunchCard } from "./_components/launch-card";
import { InstallWidgetBanner } from "./_components/install-widget-banner";
import { requireLiveBusinessContext } from "@/lib/business-context";
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
import { BarChart3, Box, CircleAlert, CircleHelp, FileText, MessageCircle, Tag, Users } from "lucide-react";
import { Card, PageHeader } from "./_components/ui";

const RECENT_LIMIT = 5;

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { businessId, businessName } = await requireLiveBusinessContext();
  const supabase = createServerSupabaseClient();

  const { welcome } = await searchParams;
  const widgetKeys = await listWidgetKeysForBusiness(businessId);
  const activeKeys = widgetKeys.filter((k) => k.status !== "revoked");
  let launchSnippet: string | null = null;
  if (welcome === "1") {
    const requestHeaders = await headers();
    const origin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
    launchSnippet = activeKeys[0] ? buildWidgetSnippet(activeKeys[0].key, origin) : null;
  }
  // Prompt (not a redirect) until the widget has served its first real chat.
  const showInstallBanner = welcome !== "1" && !activeKeys.some((k) => k.last_used_at != null);

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

  // A conversation carries no name of its own; label recent rows with the
  // prospect captured in that conversation, when one was.
  const nameByConversationId: Record<string, string> = {};
  for (const lead of leads) {
    if (lead.contact_name && !nameByConversationId[lead.conversation_id]) {
      nameByConversationId[lead.conversation_id] = lead.contact_name;
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      {welcome === "1" ? <LaunchCard snippet={launchSnippet} /> : null}
      {showInstallBanner ? <InstallWidgetBanner hasActiveKey={activeKeys.length > 0} /> : null}

      <PageHeader
        title={businessName}
        description={
          <>
            {conversationStats.last7Days} conversation{conversationStats.last7Days === 1 ? "" : "s"} in the last 7 days ·{" "}
            {leadStats.total} lead{leadStats.total === 1 ? "" : "s"} total
            {needsAttentionCount > 0
              ? ` · ${needsAttentionCount} need${needsAttentionCount === 1 ? "s" : ""} attention now`
              : ""}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={MessageCircle}
          label="Conversations"
          value={conversationStats.total}
          hint={`${conversationStats.last30Days} in the last 30 days`}
          href="/dashboard/conversations"
        />
        <KpiTile icon={Users} label="Leads" value={leadStats.total} hint="Prospects captured" href="/dashboard/leads" />
        <KpiTile
          icon={BarChart3}
          label="Conversion rate"
          value={conversionRate}
          suffix="%"
          hint="Leads / conversations"
          href="/dashboard/analytics"
        />
        <KpiTile
          icon={CircleAlert}
          attention={needsAttentionCount > 0}
          label="Needs attention"
          value={needsAttentionCount}
          hint="Awaiting a human"
          href="/dashboard/conversations"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <RecentActivity
          conversations={conversations.slice(0, RECENT_LIMIT)}
          leads={leads.slice(0, RECENT_LIMIT)}
          nameByConversationId={nameByConversationId}
        />
        <PipelinePanel byStatus={leadStats.byStatus} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <h2 className="dx-title">Lead qualification</h2>
          <QualificationDonut byQualification={leadStats.byQualification} />
        </Card>
        <ContentSummary
          items={[
            { label: "Products", count: products.length, href: "/dashboard/products", icon: Box },
            { label: "Services", count: services.length, href: "/dashboard/services", icon: Tag },
            { label: "FAQs", count: faqs.length, href: "/dashboard/faqs", icon: CircleHelp },
            {
              label: "Documents",
              count: knowledgeDocuments.length,
              href: "/dashboard/knowledge",
              icon: FileText,
            },
          ]}
        />
        <QuickActions />
      </div>
    </div>
  );
}
