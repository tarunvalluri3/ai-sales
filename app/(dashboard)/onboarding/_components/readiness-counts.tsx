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
