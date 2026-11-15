import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, linkAccent } from "./ui";

const STAGE_ORDER = ["new", "contacted", "converted", "lost"] as const;

const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  lost: "Lost",
};

const STAGE_FILL: Record<(typeof STAGE_ORDER)[number], string> = {
  new: "bg-ds-lime-mid",
  contacted: "bg-ds-lime",
  converted: "bg-ds-success",
  lost: "bg-ds-mark-neutral",
};

/**
 * Leads by pipeline stage as plain proportional bars (each bar is the
 * stage's share of the largest stage, so the longest bar fills the track).
 * Only real `getLeadStats()` counts; no synthetic series.
 */
export function PipelinePanel({
  byStatus,
}: {
  byStatus: { new: number; contacted: number; converted: number; lost: number };
}) {
  const max = Math.max(1, ...STAGE_ORDER.map((stage) => byStatus[stage]));

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="dx-title">Lead pipeline</h2>
        <Link href="/dashboard/leads" className={linkAccent}>
          View all
          <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <dl className="flex flex-1 flex-col justify-around gap-5">
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
            <dt className="text-sm text-ds-text-primary">{STAGE_LABEL[stage]}</dt>
            <dd className="contents">
              <span className="dx-track h-3.5" aria-hidden="true">
                <span className={STAGE_FILL[stage]} style={{ width: `${(byStatus[stage] / max) * 100}%` }} />
              </span>
              <span className="text-right text-sm font-medium tabular-nums text-ds-text-primary">
                {byStatus[stage]}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
