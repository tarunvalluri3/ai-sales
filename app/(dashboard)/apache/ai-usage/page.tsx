import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getPlatformAiHealth, getPerTenantCostMargin, COST_FLAG_THRESHOLD_PERCENT } from "@/lib/admin-ai-usage";
import { USD_TO_INR_RATE } from "@/lib/gemini-pricing";
import { formatPaiseAsInr2dp } from "@/lib/invoice-format";
import { AdminPageHeader } from "../_components/page-header";
import { AdminKpiTile } from "../_components/admin-kpi-tile";
import { DateRangePicker } from "../analytics/date-range-picker";
import { TenantCostTable } from "./tenant-cost-table";

const VALID_WINDOWS = [7, 30, 90];

export default async function ApacheAiUsagePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePlatformAdmin("viewer");
  const { range } = await searchParams;
  const windowDays = VALID_WINDOWS.includes(Number(range)) ? Number(range) : 30;

  const [health, tenantCosts] = await Promise.all([getPlatformAiHealth(windowDays), getPerTenantCostMargin(windowDays)]);

  const totalCostUsd = tenantCosts.reduce((sum, t) => sum + t.costUsd, 0);
  const flaggedCount = tenantCosts.filter((t) => t.flagged).length;

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader
        title="AI Usage & Costs"
        description="Built on gemini_api_calls (the token-burn audit's existing log) and a versioned pricing config -- see lib/gemini-pricing.ts for sourcing caveats."
        actions={<DateRangePicker current={windowDays} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiTile label="Total Gemini calls" value={health.totalCalls} />
        <AdminKpiTile
          label="Success rate"
          value={health.successRatePercent === null ? "—" : health.successRatePercent.toFixed(1)}
          suffix={health.successRatePercent === null ? undefined : "%"}
        />
        <AdminKpiTile
          label="Avg latency"
          value={health.avgDurationMs === null ? "—" : Math.round(health.avgDurationMs)}
          suffix={health.avgDurationMs === null ? undefined : "ms"}
        />
        <AdminKpiTile
          label="Total cost"
          value={`$${totalCostUsd.toFixed(2)}`}
          hint={`≈ ${formatPaiseAsInr2dp(Math.round(totalCostUsd * USD_TO_INR_RATE * 100))}`}
        />
      </div>

      {flaggedCount > 0 ? (
        <div className="rounded-ds-lg border border-ds-warning/40 bg-ds-warning-bg p-4 text-sm text-ds-warning">
          {flaggedCount} tenant{flaggedCount === 1 ? "" : "s"} cost more than {COST_FLAG_THRESHOLD_PERCENT}% of what they pay this period.
        </div>
      ) : null}

      <TenantCostTable tenants={tenantCosts} />

      <p className="text-xs text-ds-text-muted">
        Cache hit rate is not shown -- lib/response-cache.ts doesn&apos;t currently log a hit/miss event anywhere
        queryable, only the resulting skip of a Gemini call (which this page already reflects indirectly as a lower
        call count). Adding an explicit hit/miss log is a real follow-up, not built here.
      </p>
    </div>
  );
}
