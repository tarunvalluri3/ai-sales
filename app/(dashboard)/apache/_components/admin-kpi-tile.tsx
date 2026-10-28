import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * Like app/(dashboard)/dashboard/_components/kpi-tile.tsx (same tokens/
 * layout), plus the "% change vs previous period" badge the approved
 * Overview spec asks for on every KPI card. `percentChange === null` means
 * the previous period was zero (division is meaningless) -- rendered as
 * "New" rather than a fabricated infinite/zero percentage.
 */
export function AdminKpiTile({
  label,
  value,
  suffix,
  percentChange,
  invertTrend,
  hint,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  percentChange?: number | null;
  /** True for metrics where a rise is bad news (churn, cost) -- flips which direction renders as ds-success vs ds-danger. */
  invertTrend?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{label}</span>
      <span className="text-3xl font-semibold text-ds-text-primary">
        {value}
        {suffix}
      </span>
      {percentChange !== undefined ? <ChangeBadge percentChange={percentChange} invertTrend={invertTrend} /> : null}
      {hint ? <span className="text-xs text-ds-text-secondary">{hint}</span> : null}
    </div>
  );
}

function ChangeBadge({ percentChange, invertTrend }: { percentChange: number | null; invertTrend?: boolean }) {
  if (percentChange === null) {
    return <span className="text-xs text-ds-text-muted">New this period</span>;
  }
  const isUp = percentChange >= 0;
  const isGood = invertTrend ? !isUp : isUp;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isGood ? "text-ds-success" : "text-ds-danger"}`}>
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(percentChange).toFixed(1)}% vs previous period
    </span>
  );
}
