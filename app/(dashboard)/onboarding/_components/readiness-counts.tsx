export type ReadinessCountsData = {
  requiredDone: number;
  requiredTotal: number;
  recommendedDone: number;
  readinessTotal: number;
};

export function ReadinessCounts({ counts }: { counts: ReadinessCountsData }) {
  return (
    <span className="text-xs text-ds-text-muted">
      Required {counts.requiredDone}/{counts.requiredTotal} · Recommended {counts.recommendedDone}/{counts.readinessTotal - counts.requiredTotal}
    </span>
  );
}

export function ReadinessProgress({ counts, className = "" }: {
  counts: ReadinessCountsData;
  className?: string;
}) {
  const complete = counts.requiredDone + counts.recommendedDone;

  return (
    <div className={"flex flex-col gap-2 " + className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-sm font-medium text-ds-text-primary">Launch readiness</p>
        <ReadinessCounts counts={counts} />
      </div>
      <progress className="onboarding-meter" value={complete} max={counts.readinessTotal}
        aria-label="Launch readiness" aria-valuetext={complete + " of " + counts.readinessTotal + " items complete"} />
    </div>
  );
}
