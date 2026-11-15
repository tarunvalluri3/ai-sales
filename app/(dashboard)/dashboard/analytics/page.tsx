import { requireLiveBusinessContext } from "@/lib/business-context";
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
import { ArrowDown, ArrowUp, BarChart3, Globe, HelpCircle, Info } from "lucide-react";
import { Card, PageHeader } from "../_components/ui";
import { BreakdownBarChart } from "../_components/charts/breakdown-bar-chart";
import { QualificationDonut } from "../_components/charts/qualification-donut";
import { chartColors } from "../_components/charts/chart-colors";
import { InlineEmptyState } from "../_components/state-views";
import { ExportLeadsCsvButton } from "./export-leads-csv-button";
import { FunnelChart, largestDropOff } from "./funnel-chart";
import { ChannelPerformanceTable } from "./channel-performance-table";

export default async function AnalyticsPage() {
  const { businessId, businessName } = await requireLiveBusinessContext();
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

  const worstDropOff = largestDropOff(dropOffs);

  const conversionRate =
    conversationStats.total === 0 ? 0 : Math.round((leadStats.total / conversationStats.total) * 100);

  const headlineStats: { label: string; value: string; hint: string; attention?: boolean }[] = [
    {
      label: "Total conversations",
      value: String(conversationStats.total),
      hint: `${conversationStats.last7Days} last 7 days · ${conversationStats.last30Days} last 30 days`,
    },
    { label: "Conversion rate", value: `${conversionRate}%`, hint: "Leads / conversations" },
    { label: "Qualified-lead rate", value: `${funnelRateStats.qualifiedLeadRate}%`, hint: "Hot + warm / conversations" },
    { label: "Answer-failure rate", value: `${funnelRateStats.answerFailureRate}%`, hint: "Replies without a grounded answer" },
    {
      label: "Handoff response",
      value: handoffResponseTimeStats.sampleSize === 0 ? "—" : `${handoffResponseTimeStats.avgMinutes} min`,
      hint:
        handoffResponseTimeStats.sampleSize === 0
          ? "No handoffs with a staff reply yet"
          : `Average across ${handoffResponseTimeStats.sampleSize} handoff${handoffResponseTimeStats.sampleSize === 1 ? "" : "s"}`,
    },
    { label: "Needs attention", value: String(needsAttentionCount), hint: "Awaiting a human", attention: needsAttentionCount > 0 },
  ];

  const supportingStats: { label: string; value: string; hint?: string }[] = [
    { label: "Requested callback", value: String(leadStats.requestedCallback), hint: "Leads that asked for a callback" },
    { label: "AI responses", value: String(aiMetricsStats.responseCount), hint: "Last 7 days" },
    { label: "Avg. response time", value: `${aiMetricsStats.avgLatencyMs} ms`, hint: "Last 7 days" },
    { label: "Avg. tokens / response", value: String(aiMetricsStats.avgTokensPerResponse), hint: "Last 7 days" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        description="How your AI sales employee is performing."
        actions={<ExportLeadsCsvButton businessName={businessName} />}
      />

      <Card padded={false}>
        <dl className="grid grid-cols-2 gap-y-4 px-2 py-4 md:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-ds-border">
          {headlineStats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 px-4">
              <dt className="text-sm font-medium text-ds-text-primary">{stat.label}</dt>
              <dd className="flex flex-col gap-1">
                <span className="flex items-center gap-3 font-label text-3xl leading-none font-normal tabular-nums text-ds-text-primary">
                  {stat.attention ? <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-ds-attention" /> : null}
                  {stat.value}
                </span>
                <span className="text-sm text-ds-text-secondary">{stat.hint}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4 rounded-3xl border border-ds-border bg-ds-surface dx-card-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="dx-title">Sales funnel</h2>
            {worstDropOff ? (
              <span className="dx-pill bg-ds-warning-bg px-3.5 py-1.5 text-sm text-ds-text-primary">
                Largest drop-off: {worstDropOff.fromLabel} → {worstDropOff.toLabel} · {worstDropOff.rate}%
              </span>
            ) : null}
          </div>
          <FunnelChart stages={funnelStages} dropOffs={dropOffs} />
          <p className="mt-auto flex items-center gap-3 text-sm text-ds-text-secondary">
            <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Converted status is set by your team on the Leads page. There is no automated signal for a closed sale.
          </p>
        </section>

        <Card className="flex flex-col gap-3">
          <h2 className="dx-title">Channel performance</h2>
          <ChannelPerformanceTable channels={channelPerformance} />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "7-day leads", value: period7d.leads.current, change: period7d.leads.percentChange, window: "7 days" },
              { label: "30-day leads", value: period30d.leads.current, change: period30d.leads.percentChange, window: "30 days" },
            ].map((period) => (
              <div key={period.label} className="flex flex-col gap-1 rounded-2xl bg-ds-surface-soft px-4 py-3">
                <p className="text-sm font-medium text-ds-text-primary">{period.label}</p>
                <p className="font-label text-3xl leading-none font-normal tabular-nums text-ds-text-primary">{period.value}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ds-text-secondary">
                  {period.change === null ? (
                    "No prior period to compare"
                  ) : period.change === 0 ? (
                    `Flat vs previous ${period.window}`
                  ) : (
                    <>
                      <span className={`flex items-center font-medium ${period.change > 0 ? "text-ds-primary" : "text-ds-danger"}`}>
                        {period.change > 0 ? (
                          <ArrowUp strokeWidth={1.75} className="size-4" aria-hidden="true" />
                        ) : (
                          <ArrowDown strokeWidth={1.75} className="size-4" aria-hidden="true" />
                        )}
                        <span className="sr-only">{period.change > 0 ? "Up" : "Down"} </span>
                        {Math.abs(period.change)}%
                      </span>
                      vs previous {period.window}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-auto flex items-center gap-3 text-sm text-ds-text-secondary">
            <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Conversion = leads / conversations
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <h2 className="dx-title">Lead qualification</h2>
          <QualificationDonut byQualification={leadStats.byQualification} centerLabel="Leads" />
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Top unanswered questions</h2>
            <p className="dx-subtitle">Questions your knowledge could answer better.</p>
          </div>
          {topUnansweredQuestions.length === 0 ? (
            <InlineEmptyState icon={HelpCircle} label="No unanswered questions yet." />
          ) : (
            <ol className="dx-rows flex flex-col">
              {topUnansweredQuestions.map((item, index) => (
                <li key={item.question} className="text-sm flex items-center gap-4 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ds-surface-soft text-sm font-medium text-ds-text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-ds-text-primary">{item.question}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ds-text-primary">{item.count}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Top source pages</h2>
            <p className="dx-subtitle">Which pages produce the best prospects.</p>
          </div>
          {sourcePagePerformance.length === 0 ? (
            <InlineEmptyState icon={Globe} label="No page attribution recorded yet." />
          ) : (
            <ol className="dx-rows flex flex-col">
              {sourcePagePerformance.map((item, index) => (
                <li key={item.sourceUrl} className="text-sm flex items-center gap-4 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ds-surface-soft text-sm font-medium text-ds-text-primary">
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ds-text-primary" title={item.sourceUrl}>
                      {item.sourceUrl}
                    </span>
                    <span className="text-sm text-ds-text-secondary">{item.conversations} conversations</span>
                  </span>
                  <span className="dx-pill shrink-0 bg-ds-primary/10 px-3 py-1 text-sm text-ds-primary">{item.leadRate}% conversion</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <h2 className="dx-title pt-2">More insights</h2>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <h3 className="dx-title">Leads by status</h3>
          <BreakdownBarChart
            items={[
              { label: "New", count: leadStats.byStatus.new },
              { label: "Contacted", count: leadStats.byStatus.contacted },
              { label: "Converted", count: leadStats.byStatus.converted },
              { label: "Lost", count: leadStats.byStatus.lost },
            ]}
            colors={[chartColors.lime, chartColors.olive, chartColors.limeMid, chartColors.neutral]}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="dx-title">Messages by role</h3>
          <BreakdownBarChart
            items={[
              { label: "Prospect", count: messageStats.user },
              { label: "AI", count: messageStats.assistant },
              { label: "Staff reply", count: messageStats.humanAgent },
            ]}
            colors={[chartColors.neutral, chartColors.lime, chartColors.olive]}
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="dx-title">Callbacks and AI performance</h3>
          <dl className="dx-rows flex flex-col">
            {supportingStats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="flex flex-col">
                  <span className="text-sm text-ds-text-primary">{stat.label}</span>
                  {stat.hint ? <span className="text-sm text-ds-text-secondary">{stat.hint}</span> : null}
                </dt>
                <dd className="text-base font-medium tabular-nums text-ds-text-primary">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-ds-text-secondary">
            Real Gemini latency and token usage, measured per response. Uptime, error rates and full request traces live in{" "}
            <a
              href="https://waves-web-studio.sentry.io/projects/ai-sales/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ds-primary underline underline-offset-4"
            >
              Sentry
            </a>{" "}
            and the{" "}
            <a
              href="https://vercel.com/taruns-projects-fe9a950f/ai-sales"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ds-primary underline underline-offset-4"
            >
              Vercel dashboard
            </a>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
