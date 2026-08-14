"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors } from "./chart-colors";

const DEFAULT_COLORS = [chartColors.accent, chartColors.success, chartColors.warning, chartColors.danger];

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-ds-sm border border-ds-border-strong bg-ds-surface-elevated px-3 py-1.5 text-xs shadow-lg">
      <span className="text-ds-text-secondary">{payload[0].name}: </span>
      <span className="font-semibold text-ds-text-primary">{payload[0].value}</span>
    </div>
  );
}

/**
 * Horizontal, animated breakdown bar chart for small categorical counts
 * (e.g. leads by status). Renders only real data already computed by
 * `lib/analytics.ts` — no synthetic series.
 */
export function BreakdownBarChart({
  items,
  colors = DEFAULT_COLORS,
}: {
  items: { label: string; count: number }[];
  colors?: string[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return <p className="text-sm text-ds-text-muted">No data yet.</p>;
  }

  const data = items.map((item) => ({ name: item.label, value: item.count }));

  return (
    <div className="h-40 w-full" role="img" aria-label={items.map((i) => `${i.label}: ${i.count}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tickLine={false}
            axisLine={false}
            tick={{ fill: chartColors.textSecondary, fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: chartColors.border }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} animationDuration={700} animationEasing="ease-out">
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
