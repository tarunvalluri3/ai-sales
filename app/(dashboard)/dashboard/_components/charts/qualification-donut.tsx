"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Info, PieChart as PieChartIcon } from "lucide-react";
import { chartColors } from "./chart-colors";
import { InlineEmptyState } from "../state-views";

const SEGMENTS = ["hot", "warm", "cold"] as const;

const SEGMENT_COLOR: Record<(typeof SEGMENTS)[number], string> = {
  hot: chartColors.olive,
  warm: chartColors.lime,
  cold: chartColors.neutral,
};

const SEGMENT_LABEL: Record<(typeof SEGMENTS)[number], string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-ds-border bg-ds-surface-elevated px-3 py-1.5 text-xs shadow-float">
      <span className="text-ds-text-secondary">{payload[0].name}: </span>
      <span className="font-medium text-ds-text-primary">{payload[0].value}</span>
    </div>
  );
}

/**
 * Donut of leads by AI qualification with the total in the centre and a
 * count legend beside it. Renders only real `getLeadStats()` output; the
 * footnote is the standing reminder that qualification is an AI-generated
 * signal, not verified human truth (PRODUCT.md).
 */
export function QualificationDonut({
  byQualification,
  centerLabel = "total",
}: {
  byQualification: { hot: number; warm: number; cold: number };
  centerLabel?: string;
}) {
  const total = byQualification.hot + byQualification.warm + byQualification.cold;

  if (total === 0) {
    return (
      <div className="flex h-44 w-full flex-col">
        <InlineEmptyState icon={PieChartIcon} label="No leads yet." />
      </div>
    );
  }

  const data = SEGMENTS.filter((key) => byQualification[key] > 0).map((key) => ({
    name: SEGMENT_LABEL[key],
    value: byQualification[key],
    key,
  }));

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={0}
              startAngle={90}
              endAngle={-270}
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
          <span className="text-[28px] leading-[1.15] font-light sm:text-[32px] text-ds-text-primary">{total}</span>
          <span className="mt-1 text-sm text-ds-text-secondary">{centerLabel}</span>
        </div>
      </div>

      <div className="flex min-w-36 flex-1 flex-col gap-3">
        <dl className="dx-rows flex flex-col">
          {SEGMENTS.map((key) => (
            <div key={key} className="flex items-center gap-3 py-2">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: SEGMENT_COLOR[key] }} />
              <dt className="flex-1 text-sm text-ds-text-primary">{SEGMENT_LABEL[key]}</dt>
              <dd className="text-sm font-medium tabular-nums text-ds-text-primary">{byQualification[key]}</dd>
            </div>
          ))}
        </dl>
        <p className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
          <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          AI-assessed · Not verified
        </p>
      </div>
    </div>
  );
}
