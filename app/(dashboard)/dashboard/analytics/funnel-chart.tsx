import type { DropOff, FunnelStage } from "@/lib/analytics";

/** Darkest for the top of the funnel, fading as it narrows. */
const STAGE_FILL = ["bg-ds-primary", "bg-ds-primary/85", "bg-ds-lime", "bg-ds-lime-mid", "bg-ds-primary/35", "bg-ds-primary/25"];

/**
 * A horizontal-bar funnel: each stage's bar width is relative to the first
 * stage's count, with the raw count and the conversion rate from the very
 * first stage alongside. The single largest drop between adjacent stages is
 * called out by the page (see `largestDropOff`); the full per-stage
 * drop-off list sits underneath, since "why did this stage lose people" is a
 * distinct question from "how big is it."
 */
export function FunnelChart({ stages, dropOffs }: { stages: FunnelStage[]; dropOffs: DropOff[] }) {
  const first = stages[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {stages.map((stage, index) => {
          const widthPercent = first === 0 ? 0 : Math.max(3, Math.round((stage.count / first) * 100));
          const rateFromFirst = first === 0 ? 0 : Math.round((stage.count / first) * 1000) / 10;
          return (
            <div key={stage.key} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem_3.5rem] items-center gap-3">
              <dt className="text-sm text-ds-text-primary">{stage.label}</dt>
              <dd className="contents">
                <span className="dx-track h-4" aria-hidden="true">
                  <span className={STAGE_FILL[index % STAGE_FILL.length]} style={{ width: `${widthPercent}%` }} />
                </span>
                <span className="text-right text-sm font-medium tabular-nums text-ds-text-primary">{stage.count}</span>
                <span className="text-right text-sm tabular-nums text-ds-text-secondary">{rateFromFirst}%</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {dropOffs.some((d) => d.rate > 0) ? (
        <details className="border-t border-ds-border pt-3">
          <summary className="cursor-pointer rounded-md text-sm font-medium text-ds-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary">
            Drop-off between stages
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {dropOffs.map((dropOff) => (
              <li key={`${dropOff.fromLabel}-${dropOff.toLabel}`} className="flex items-center justify-between text-xs">
                <span className="text-ds-text-primary">
                  {dropOff.fromLabel} → {dropOff.toLabel}
                </span>
                <span className={dropOff.rate >= 50 ? "font-medium text-ds-danger" : "text-ds-text-secondary"}>{dropOff.rate}% drop-off</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** The adjacent-stage pair that loses the most prospects, or null when nothing drops. */
export function largestDropOff(dropOffs: DropOff[]): DropOff | null {
  let worst: DropOff | null = null;
  for (const dropOff of dropOffs) {
    if (dropOff.rate > 0 && (worst === null || dropOff.rate > worst.rate)) worst = dropOff;
  }
  return worst;
}
