import Link from "next/link";
import { BreakdownBarChart } from "./charts/breakdown-bar-chart";
import { chartColors } from "./charts/chart-colors";

const STAGE_ORDER = ["new", "contacted", "converted", "lost"] as const;

const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  lost: "Lost",
};

const STAGE_COLORS = [chartColors.accent, chartColors.accentMuted, chartColors.success, chartColors.textMuted];

export function PipelinePanel({
  byStatus,
}: {
  byStatus: { new: number; contacted: number; converted: number; lost: number };
}) {
  const items = STAGE_ORDER.map((stage) => ({ label: STAGE_LABEL[stage], count: byStatus[stage] }));

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-ds-text-primary">Lead pipeline</h2>
        <Link
          href="/dashboard/leads"
          className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          View all
        </Link>
      </div>

      <BreakdownBarChart items={items} colors={STAGE_COLORS} />
    </section>
  );
}
