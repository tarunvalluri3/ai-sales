"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { chartColors } from "@/app/(dashboard)/dashboard/_components/charts/chart-colors";
import { InlineEmptyState } from "@/app/(dashboard)/dashboard/_components/state-views";

/** Multi-series daily trend line, same chartColors/empty-state conventions as app/(dashboard)/dashboard/_components/charts. New here because that folder has no line-chart precedent yet (only a horizontal bar and a donut). */
export function TrendLineChart({
  data,
  series,
}: {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  const total = data.reduce((sum, row) => sum + series.reduce((s, ser) => s + (Number(row[ser.key]) || 0), 0), 0);

  if (total === 0) {
    return (
      <div className="flex h-56 w-full flex-col">
        <InlineEmptyState icon={TrendingUp} label="No data in this period yet." />
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={chartColors.border} />
          <XAxis dataKey="date" tick={{ fill: chartColors.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: chartColors.textMuted, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: chartColors.surfaceElevated,
              border: `1px solid ${chartColors.border}`,
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} animationDuration={700} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
