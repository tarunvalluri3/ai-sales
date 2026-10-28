import { FragmentCard } from "./_shared";

// Demo numbers, last 7 days -- not real tenant data.
const WEEK = [12, 18, 15, 22, 19, 27, 24];
const MAX = Math.max(...WEEK);
const BAR_WIDTH = 28;
const GAP = 12;

/** Conversations, conversion rate, and lead breakdown -- drawn as plain SVG, no chart library. */
export function AnalyticsMini() {
  return (
    <FragmentCard className="p-4">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Conversations" value="482" />
        <Stat label="Conversion" value="18%" />
        <Stat label="Hot leads" value="36" />
      </div>
      <svg viewBox="0 0 280 64" className="h-16 w-full" role="img" aria-label="Conversations per day, last 7 days">
        {WEEK.map((value, index) => {
          const x = index * (BAR_WIDTH + GAP) + 6;
          const height = (value / MAX) * 56;
          const y = 64 - height;
          const isLast = index === WEEK.length - 1;
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={BAR_WIDTH}
              height={height}
              rx={2}
              fill={isLast ? "var(--ds-accent)" : "var(--ds-border-strong)"}
            />
          );
        })}
      </svg>
      <div className="mt-3 flex items-center gap-3 border-t border-ds-border pt-3">
        <LeadDot tone="danger" label="Hot" pct={22} />
        <LeadDot tone="warning" label="Warm" pct={41} />
        <LeadDot tone="muted" label="Cold" pct={37} />
      </div>
    </FragmentCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{label}</span>
      <span className="text-lg font-semibold text-ds-text-primary">{value}</span>
    </div>
  );
}

function LeadDot({ tone, label, pct }: { tone: "danger" | "warning" | "muted"; label: string; pct: number }) {
  const color = { danger: "bg-ds-danger", warning: "bg-ds-warning", muted: "bg-ds-text-muted" }[tone];
  return (
    <span className="flex items-center gap-1.5 text-2xs text-ds-text-secondary">
      <span className={`size-1.5 rounded-full ${color}`} aria-hidden="true" />
      {label} {pct}%
    </span>
  );
}
