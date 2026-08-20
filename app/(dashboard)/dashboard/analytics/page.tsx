import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";
import {
  getAiResponseMetricsStats,
  getConversationVolumeStats,
  getLeadStats,
  getMessageVolumeStats,
} from "@/lib/analytics";
import { KpiTile } from "../_components/kpi-tile";
import { BreakdownBarChart } from "../_components/charts/breakdown-bar-chart";
import { QualificationDonut } from "../_components/charts/qualification-donut";
import { chartColors } from "../_components/charts/chart-colors";

export default async function AnalyticsPage() {
  const { businessId } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [conversationStats, messageStats, leadStats, needsAttentionCount, aiMetricsStats] = await Promise.all([
    getConversationVolumeStats(supabase, businessId),
    getMessageVolumeStats(supabase, businessId),
    getLeadStats(supabase, businessId),
    countConversationsNeedingAttention(supabase, businessId),
    getAiResponseMetricsStats(supabase, businessId),
  ]);

  const conversionRate =
    conversationStats.total === 0 ? 0 : Math.round((leadStats.total / conversationStats.total) * 100);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ds-text-primary">Analytics</h1>
        <p className="text-sm text-ds-text-secondary">
          How your AI sales employee is performing, from real conversation and lead data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Total conversations" value={conversationStats.total} href="/dashboard/conversations" />
        <KpiTile label="Last 7 days" value={conversationStats.last7Days} href="/dashboard/conversations" />
        <KpiTile label="Last 30 days" value={conversationStats.last30Days} href="/dashboard/conversations" />
        <KpiTile label="Needs attention now" value={needsAttentionCount} href="/dashboard/conversations" />
        <KpiTile label="Conversion rate" value={conversionRate} suffix="%" hint="Leads / conversations" href="/dashboard/leads" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Leads by qualification</h2>
          <p className="text-2xs text-ds-text-muted">AI-assigned signal, not verified human truth.</p>
          <QualificationDonut byQualification={leadStats.byQualification} />
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Leads by status</h2>
          <BreakdownBarChart
            items={[
              { label: "New", count: leadStats.byStatus.new },
              { label: "Contacted", count: leadStats.byStatus.contacted },
              { label: "Converted", count: leadStats.byStatus.converted },
              { label: "Lost", count: leadStats.byStatus.lost },
            ]}
            colors={[chartColors.accent, chartColors.accentMuted, chartColors.success, chartColors.textMuted]}
          />
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-sm font-medium text-ds-text-primary">Messages by role</h2>
          <BreakdownBarChart
            items={[
              { label: "Prospect", count: messageStats.user },
              { label: "AI", count: messageStats.assistant },
              { label: "Staff reply", count: messageStats.humanAgent },
            ]}
            colors={[chartColors.accentMuted, chartColors.accent, chartColors.warning]}
          />
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-ds-text-primary">AI performance (last 7 days)</h2>
          <p className="text-2xs text-ds-text-muted">
            Real Gemini latency and token usage, measured per response. Uptime, error rates, and full
            request traces live in{" "}
            <a
              href="https://waves-web-studio.sentry.io/projects/ai-sales/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ds-text-primary"
            >
              Sentry
            </a>{" "}
            and the{" "}
            <a
              href="https://vercel.com/taruns-projects-fe9a950f/ai-sales"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ds-text-primary"
            >
              Vercel dashboard
            </a>
            .
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile label="AI responses" value={aiMetricsStats.responseCount} />
          <KpiTile label="Avg. response time" value={aiMetricsStats.avgLatencyMs} suffix="ms" />
          <KpiTile label="Avg. tokens / response" value={aiMetricsStats.avgTokensPerResponse} />
        </div>
      </div>
    </div>
  );
}
