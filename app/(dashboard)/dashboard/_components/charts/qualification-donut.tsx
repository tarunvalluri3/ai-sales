"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { chartColors } from "./chart-colors";

const SEGMENT_COLOR: Record<"hot" | "warm" | "cold", string> = {
  hot: chartColors.danger,
  warm: chartColors.warning,
  cold: chartColors.accentMuted,
};

const SEGMENT_LABEL: Record<"hot" | "warm" | "cold", string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-ds-sm border border-ds-border-strong bg-ds-surface-elevated px-3 py-1.5 text-xs shadow-lg">
      <span className="text-ds-text-secondary">{payload[0].name}: </span>
      <span className="font-semibold text-ds-text-primary">{payload[0].value}</span>
    </div>
  );
}

/**
 * Donut chart of leads by AI qualification, with the total in the center.
 * Renders only real `getLeadStats()` output — a reminder that qualification
 * is an AI-generated signal, not verified human truth (PRODUCT.md).
 */
export function QualificationDonut({
  byQualification,
}: {
  byQualification: { hot: number; warm: number; cold: number };
}) {
  const total = byQualification.hot + byQualification.warm + byQualification.cold;

  if (total === 0) {
    return <p className="text-sm text-ds-text-muted">No leads yet.</p>;
  }

  const data = (["hot", "warm", "cold"] as const)
    .filter((key) => byQualification[key] > 0)
    .map((key) => ({ name: SEGMENT_LABEL[key], value: byQualification[key], key }));

  return (
    <div className="relative h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={3}
            stroke="none"
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={SEGMENT_COLOR[entry.key]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-ds-text-primary">{total}</span>
        <span className="text-2xs text-ds-text-muted">leads</span>
      </div>
    </div>
  );
}
