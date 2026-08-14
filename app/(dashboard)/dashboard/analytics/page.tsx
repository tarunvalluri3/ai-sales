import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";
import { getConversationVolumeStats, getLeadStats, getMessageVolumeStats } from "@/lib/analytics";
import { StatCard } from "../_components/stat-card";
import { StatBreakdown } from "../_components/stat-breakdown";

export default async function AnalyticsPage() {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [conversationStats, messageStats, leadStats, needsAttentionCount] = await Promise.all([
    getConversationVolumeStats(supabase, businessId),
    getMessageVolumeStats(supabase, businessId),
    getLeadStats(supabase, businessId),
    countConversationsNeedingAttention(supabase, businessId),
  ]);

  const conversionRate =
    conversationStats.total === 0 ? 0 : Math.round((leadStats.total / conversationStats.total) * 100);

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Analytics</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total conversations" count={conversationStats.total} href="/dashboard/conversations" />
        <StatCard label="Conversations, last 7 days" count={conversationStats.last7Days} href="/dashboard/conversations" />
        <StatCard label="Conversations, last 30 days" count={conversationStats.last30Days} href="/dashboard/conversations" />
        <StatCard label="Needs attention now" count={needsAttentionCount} href="/dashboard/conversations" />
        <StatCard label="Conversion rate" count={conversionRate} suffix="%" href="/dashboard/leads" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatBreakdown
          label="Leads by qualification"
          items={[
            { label: "Hot", count: leadStats.byQualification.hot },
            { label: "Warm", count: leadStats.byQualification.warm },
            { label: "Cold", count: leadStats.byQualification.cold },
          ]}
        />
        <StatBreakdown
          label="Leads by status"
          items={[
            { label: "New", count: leadStats.byStatus.new },
            { label: "Contacted", count: leadStats.byStatus.contacted },
            { label: "Converted", count: leadStats.byStatus.converted },
            { label: "Lost", count: leadStats.byStatus.lost },
          ]}
        />
        <StatBreakdown
          label="Messages by role"
          items={[
            { label: "Prospect", count: messageStats.user },
            { label: "AI", count: messageStats.assistant },
            { label: "Staff reply", count: messageStats.humanAgent },
          ]}
        />
      </div>
    </div>
  );
}
