import type { DropOff, FunnelStage } from "@/lib/analytics";

/**
 * A simple horizontal-bar funnel -- each stage's bar width is relative to
 * the first stage's count, with the raw count and (from the second stage
 * on) the conversion rate from the very first stage shown alongside. Drop-off
 * between adjacent stages is called out separately below, since "why did
 * this stage lose people" is a distinct question from "how big is it."
 */
export function FunnelChart({ stages, dropOffs }: { stages: FunnelStage[]; dropOffs: DropOff[] }) {
  const first = stages[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {stages.map((stage) => {
          const widthPercent = first === 0 ? 0 : Math.max(4, Math.round((stage.count / first) * 100));
          const rateFromFirst = first === 0 ? 0 : Math.round((stage.count / first) * 100);
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-ds-text-secondary">{stage.label}</span>
              <div className="h-6 flex-1 rounded-ds-sm bg-ds-surface-soft">
                <div className="h-6 rounded-ds-sm bg-ds-accent" style={{ width: `${widthPercent}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-medium text-ds-text-primary">
                {stage.count}
                <span className="ml-1 text-2xs font-normal text-ds-text-muted">({rateFromFirst}%)</span>
              </span>
            </div>
          );
        })}
      </div>

      {dropOffs.some((d) => d.rate > 0) ? (
        <div className="flex flex-col gap-1 border-t border-ds-border pt-3">
          <span className="text-2xs font-semibold tracking-wide-ds text-ds-text-secondary uppercase">Drop-off between stages</span>
          {dropOffs.map((dropOff) => (
            <div key={`${dropOff.fromLabel}-${dropOff.toLabel}`} className="flex items-center justify-between text-xs">
              <span className="text-ds-text-secondary">
                {dropOff.fromLabel} → {dropOff.toLabel}
              </span>
              <span className={dropOff.rate >= 50 ? "font-medium text-ds-danger" : "text-ds-text-muted"}>{dropOff.rate}% drop-off</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
