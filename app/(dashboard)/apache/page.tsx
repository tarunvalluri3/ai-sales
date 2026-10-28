import { getOverviewMetrics, USD_TO_INR_RATE } from "@/lib/admin-metrics";
import { formatPaiseAsInr2dp } from "@/lib/invoice-format";
import { AdminPageHeader } from "./_components/page-header";
import { AdminKpiTile } from "./_components/admin-kpi-tile";

/**
 * Phase 33, Stop 1 (docs/phases.md): the /apache Overview page. The
 * approved brief's "charts" (signups over time, MRR trend, conversations
 * by channel) are deliberately NOT built here yet -- a historical MRR
 * trend needs the analytics_events rollups Stop 3 builds; fabricating one
 * from a single current snapshot would be exactly the kind of invented
 * business fact AGENTS.md §3 rule 4 forbids. The KPI tiles below are all
 * computed from real current data (lib/admin-metrics.ts).
 */
export default async function ApacheOverviewPage() {
  const metrics = await getOverviewMetrics();

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <AdminPageHeader
        title="Overview"
        description="Platform-wide KPIs across every tenant, computed from real stored data."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Tenants</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiTile label="Total tenants" value={metrics.totalTenants} />
          <AdminKpiTile
            label="New signups (7d)"
            value={metrics.newSignups7d.current}
            percentChange={metrics.newSignups7d.percentChange}
          />
          <AdminKpiTile
            label="Active tenants (7d)"
            value={metrics.activeTenants7d.current}
            percentChange={metrics.activeTenants7d.percentChange}
            hint="Had at least one real conversation"
          />
          <AdminKpiTile label="Trials expiring this week" value={metrics.trialsExpiringThisWeek} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Revenue</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiTile label="MRR" value={formatPaiseAsInr2dp(metrics.revenue.mrrPaise)} />
          <AdminKpiTile label="ARR" value={formatPaiseAsInr2dp(metrics.revenue.arrPaise)} />
          <AdminKpiTile label="Paying tenants" value={metrics.revenue.payingTenantCount} />
          <AdminKpiTile
            label="Churn rate (30d)"
            value={metrics.revenue.churnRatePercent === null ? "—" : metrics.revenue.churnRatePercent.toFixed(1)}
            suffix={metrics.revenue.churnRatePercent === null ? undefined : "%"}
            hint="Cancelled or expired in the last 30 days"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wide-ds text-ds-text-muted uppercase">Today (IST)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminKpiTile
            label="Conversations today"
            value={metrics.conversationsToday.current}
            percentChange={metrics.conversationsToday.percentChange}
          />
          <AdminKpiTile
            label="Leads captured"
            value={metrics.leadsToday.current}
            percentChange={metrics.leadsToday.percentChange}
          />
          <AdminKpiTile
            label="Appointments booked"
            value={metrics.appointmentsBookedToday.current}
            percentChange={metrics.appointmentsBookedToday.percentChange}
          />
          <AdminKpiTile
            label="Gemini cost today"
            value={`$${metrics.geminiCost.todayUsd.toFixed(2)}`}
            hint={`≈ ${formatPaiseAsInr2dp(Math.round(metrics.geminiCost.todayUsd * USD_TO_INR_RATE * 100))}${
              metrics.geminiCost.unpricedCallsToday > 0
                ? ` · ${metrics.geminiCost.unpricedCallsToday} call${metrics.geminiCost.unpricedCallsToday === 1 ? "" : "s"} unpriced`
                : ""
            }`}
          />
        </div>
        <p className="text-xs text-ds-text-muted">
          Gemini cost, month to date: ${metrics.geminiCost.monthToDateUsd.toFixed(2)} (≈{" "}
          {formatPaiseAsInr2dp(Math.round(metrics.geminiCost.monthToDateUsd * USD_TO_INR_RATE * 100))}). Pricing
          assumptions are documented in lib/gemini-pricing.ts and should be reconfirmed against Google&apos;s own
          pricing page before being used for a real finance decision.
        </p>
      </section>

      <section className="rounded-ds-lg border border-dashed border-ds-border p-6">
        <h2 className="text-sm font-semibold text-ds-text-primary">Needs attention, charts, and more</h2>
        <p className="mt-1 text-xs text-ds-text-secondary">
          The &quot;Needs attention&quot; list (broken integrations, failed payments, error spikes, tenants over
          usage limits, inactive 14+ days) and the signups/MRR-trend/channel-mix charts ship in Stop 2–3, once the
          Tenants data layer and the analytics_events rollups exist to back them with real data.
        </p>
      </section>
    </div>
  );
}
