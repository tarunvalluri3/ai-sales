import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getActiveTenantCounts,
  getActivationFunnel,
  getChannelMix,
  getLeadToAppointmentConversion,
  getDailyTrend,
  getPeriodComparison,
} from "@/lib/admin-analytics";
import { percentChange } from "@/lib/admin-metrics";
import { AdminPageHeader } from "../_components/page-header";
import { AdminKpiTile } from "../_components/admin-kpi-tile";
import { TrendLineChart } from "../_components/charts/trend-line-chart";
import { BreakdownBarChart } from "@/app/(dashboard)/dashboard/_components/charts/breakdown-bar-chart";
import { chartColors } from "@/app/(dashboard)/dashboard/_components/charts/chart-colors";
import { DateRangePicker } from "./date-range-picker";

const VALID_WINDOWS = [7, 30, 90];

export default async function ApacheAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePlatformAdmin("viewer");
  const { range } = await searchParams;
  const windowDays = VALID_WINDOWS.includes(Number(range)) ? Number(range) : 30;

  const [activeTenants, funnel, channelMix, conversion, trend, comparison] = await Promise.all([
    getActiveTenantCounts(),
    getActivationFunnel(),
    getChannelMix(windowDays),
    getLeadToAppointmentConversion(windowDays),
    getDailyTrend(windowDays),
    getPeriodComparison(windowDays),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader
        title="Analytics"
        description="Platform-wide activity, computed from the daily rollup job -- not a live cross-tenant query."
        actions={<DateRangePicker current={windowDays} />}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Active tenants</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminKpiTile label="DAU" value={activeTenants.dau} hint="Businesses with a real conversation, last 24h" />
          <AdminKpiTile label="WAU" value={activeTenants.wau} hint="Last 7 days" />
          <AdminKpiTile label="MAU" value={activeTenants.mau} hint="Last 30 days" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">
          Volume, last {windowDays} days
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminKpiTile
            label="Conversations"
            value={comparison.current.conversations}
            percentChange={percentChange(comparison.current.conversations, comparison.previous.conversations)}
          />
          <AdminKpiTile
            label="Leads"
            value={comparison.current.leads}
            percentChange={percentChange(comparison.current.leads, comparison.previous.leads)}
          />
          <AdminKpiTile
            label="Appointments"
            value={comparison.current.appointments}
            percentChange={percentChange(comparison.current.appointments, comparison.previous.appointments)}
          />
        </div>
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <TrendLineChart
            data={trend}
            series={[
              { key: "conversations", label: "Conversations", color: chartColors.accent },
              { key: "leads", label: "Leads", color: chartColors.success },
              { key: "appointments", label: "Appointments", color: chartColors.warning },
            ]}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">
            Activation funnel (all time)
          </h2>
          <BreakdownBarChart
            items={[
              { label: "Signed up", count: funnel.signedUp },
              { label: "Published", count: funnel.published },
              { label: "1st conversation", count: funnel.hadConversation },
              { label: "1st lead", count: funnel.hadLead },
              { label: "Paying", count: funnel.paying },
            ]}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
          <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">
            Channel mix, last {windowDays} days
          </h2>
          <BreakdownBarChart
            items={[
              { label: "Website", count: channelMix.website },
              { label: "WhatsApp", count: channelMix.whatsapp },
              { label: "Instagram", count: channelMix.instagram },
            ]}
          />
        </section>
      </div>

      <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="mb-2 text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">
          Leads → appointment conversion, last {windowDays} days
        </h2>
        <p className="text-sm text-ds-text-secondary">
          {conversion.leads} leads → {conversion.appointments} appointments
          {conversion.ratePercent !== null ? ` (${conversion.ratePercent.toFixed(1)}%)` : " (no leads in this period)"}
        </p>
      </section>

      <p className="text-xs text-ds-text-muted">
        Cohort retention heatmap and per-feature usage are not built in this stop -- both need more rollup history
        than one day of data can demonstrate; revisit once the rollup job has run for a few weeks.
      </p>
    </div>
  );
}
