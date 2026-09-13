import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countConversationsNeedingAttention } from "@/lib/conversations";
import {
  getAiResponseMetricsStats,
  getChannelPerformanceStats,
  getConversationVolumeStats,
  getFunnelRateStats,
  getFunnelStats,
  getHandoffResponseTimeStats,
  getLeadStats,
  getMessageVolumeStats,
  getPeriodComparisonStats,
  getSourcePagePerformance,
  getTopUnansweredQuestions,
  computeDropOffs,
} from "@/lib/analytics";
import { HelpCircle, Globe } from "lucide-react";
import { KpiTile } from "../_components/kpi-tile";
import { BreakdownBarChart } from "../_components/charts/breakdown-bar-chart";
import { QualificationDonut } from "../_components/charts/qualification-donut";
import { chartColors } from "../_components/charts/chart-colors";
import { InlineEmptyState } from "../_components/state-views";
import { ExportLeadsCsvButton } from "./export-leads-csv-button";
import { FunnelChart } from "./funnel-chart";
import { ChannelPerformanceTable } from "./channel-performance-table";

export default async function AnalyticsPage() {
  const { businessId, businessName } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();

  const [
    conversationStats,
    messageStats,
    leadStats,
    needsAttentionCount,
    aiMetricsStats,
    funnelRateStats,
    handoffResponseTimeStats,
    topUnansweredQuestions,
    sourcePagePerformance,
    funnelStages,
    channelPerformance,
    period7d,
    period30d,
  ] = await Promise.all([
    getConversationVolumeStats(supabase, businessId),
    getMessageVolumeStats(supabase, businessId),
    getLeadStats(supabase, businessId),
    countConversationsNeedingAttention(supabase, businessId),
    getAiResponseMetricsStats(supabase, businessId),
    getFunnelRateStats(supabase, businessId),
    getHandoffResponseTimeStats(supabase, businessId),
    getTopUnansweredQuestions(supabase, businessId),
    getSourcePagePerformance(supabase, businessId),
    getFunnelStats(supabase, businessId),
    getChannelPerformanceStats(supabase, businessId),
    getPeriodComparisonStats(supabase, businessId, 7),
    getPeriodComparisonStats(supabase, businessId, 30),
  ]);

  const dropOffs = computeDropOffs(funnelStages);

  function formatChange(change: number | null): string {
    if (change === null) return "no prior period to compare";
    if (change === 0) return "flat vs previous period";
    return `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs previous period`;
  }

  const conversionRate =
    conversationStats.total === 0 ? 0 : Math.round((leadStats.total / conversationStats.total) * 100);

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-ds-text-primary">Analytics</h1>
          <p className="text-sm text-ds-text-secondary">
            How your AI sales employee is performing, from real conversation and lead data.
          </p>
        </div>
        <ExportLeadsCsvButton businessName={businessName} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Total conversations" value={conversationStats.total} href="/dashboard/conversations" />
        <KpiTile label="Last 7 days" value={conversationStats.last7Days} href="/dashboard/conversations" />
        <KpiTile label="Last 30 days" value={conversationStats.last30Days} href="/dashboard/conversations" />
        <KpiTile label="Needs attention now" value={needsAttentionCount} href="/dashboard/conversations" />
        <KpiTile label="Conversion rate" value={conversionRate} suffix="%" hint="Leads / conversations" href="/dashboard/leads" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Qualified-lead rate"
          value={funnelRateStats.qualifiedLeadRate}
          suffix="%"
          hint="Hot + warm leads / conversations"
          href="/dashboard/leads"
        />
        <KpiTile
          label="Answer-failure rate"
          value={funnelRateStats.answerFailureRate}
          suffix="%"
          hint="AI replies with no grounded answer"
        />
        <KpiTile
          label="Handoff response time"
          value={handoffResponseTimeStats.sampleSize === 0 ? "—" : handoffResponseTimeStats.avgMinutes}
          suffix={handoffResponseTimeStats.sampleSize === 0 ? "" : "min"}
          hint={
            handoffResponseTimeStats.sampleSize === 0
              ? "No handoffs with a staff reply yet"
              : `Avg. over last ${handoffResponseTimeStats.sampleSize} handoff(s)`
          }
          href="/dashboard/conversations"
        />
        <KpiTile
          label="Requested callback"
          value={leadStats.requestedCallback}
          hint="Leads that asked for a callback"
          href="/dashboard/leads"
        />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile
          label="7-day leads"
          value={period7d.leads.current}
          hint={formatChange(period7d.leads.percentChange)}
          href="/dashboard/leads"
        />
        <KpiTile
          label="30-day leads"
          value={period30d.leads.current}
          hint={formatChange(period30d.leads.percentChange)}
          href="/dashboard/leads"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Sales funnel</h2>
            <p className="text-2xs text-ds-text-muted">
              Conversations → leads → qualified → appointments → completed → converted. &ldquo;Converted&rdquo; is a
              status your team sets on the Leads page — this app has no automated signal for a closed sale.
            </p>
          </div>
          <FunnelChart stages={funnelStages} dropOffs={dropOffs} />
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Channel performance</h2>
            <p className="text-2xs text-ds-text-muted">Website, WhatsApp, and Instagram, side by side.</p>
          </div>
          <ChannelPerformanceTable channels={channelPerformance} />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Top unanswered questions</h2>
            <p className="text-2xs text-ds-text-muted">
              Questions the AI could not answer from your knowledge base — the biggest opportunity to
              close gaps in Products, Services, FAQs, or Knowledge.
            </p>
          </div>
          {topUnansweredQuestions.length === 0 ? (
            <InlineEmptyState icon={HelpCircle} label="No unanswered questions yet." />
          ) : (
            <ol className="flex flex-col gap-2">
              {topUnansweredQuestions.map((item, index) => (
                <li key={item.question} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-ds-text-secondary">
                    <span className="text-ds-text-muted">{index + 1}.</span> {item.question}
                  </span>
                  <span className="shrink-0 rounded-ds-sm bg-ds-surface-soft px-2 py-0.5 text-2xs font-medium text-ds-text-muted">
                    {item.count}×
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-ds-text-primary">Top source pages</h2>
            <p className="text-2xs text-ds-text-muted">
              Which pages produce the best prospects, not just the most conversations.
            </p>
          </div>
          {sourcePagePerformance.length === 0 ? (
            <InlineEmptyState icon={Globe} label="No page attribution recorded yet." />
          ) : (
            <ol className="flex flex-col gap-2">
              {sourcePagePerformance.map((item, index) => (
                <li key={item.sourceUrl} className="flex items-start justify-between gap-3 text-sm">
                  <span className="truncate text-ds-text-secondary">
                    <span className="text-ds-text-muted">{index + 1}.</span> {item.sourceUrl}
                    <span className="ml-1 text-2xs text-ds-text-muted">({item.conversations} conversations)</span>
                  </span>
                  <span className="shrink-0 rounded-ds-sm bg-ds-surface-soft px-2 py-0.5 text-2xs font-medium text-ds-text-muted">
                    {item.leadRate}% lead conversion
                  </span>
                </li>
              ))}
            </ol>
          )}
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
