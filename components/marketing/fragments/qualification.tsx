import { FragmentCard, MicroChip, type ChipTone } from "./_shared";

const LEADS: { name: string; tier: "hot" | "warm" | "cold"; reason: string }[] = [
  { name: "Aarav Mehta", tier: "hot", reason: "Asked for pricing twice and requested a callback." },
  { name: "Priya Shah", tier: "warm", reason: "Compared two services, gave an email." },
  { name: "Visitor #482", tier: "cold", reason: "Asked one general question, no contact info." },
];

const TIER_TONE: Record<"hot" | "warm" | "cold", ChipTone> = {
  hot: "danger",
  warm: "warning",
  cold: "default",
};

/** Three qualified leads, each tagged hot/warm/cold with a short AI reason. */
export function Qualification() {
  return (
    <FragmentCard className="p-4">
      <div className="flex flex-col gap-2">
        {LEADS.map((lead) => (
          <div
            key={lead.name}
            className={`flex flex-col gap-1.5 rounded-ds-sm border px-3 py-2.5 ${
              lead.tier === "hot"
                ? "border-ds-accent-muted bg-ds-accent-soft-bg"
                : "border-ds-border bg-ds-surface-elevated"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ds-text-primary">{lead.name}</span>
              <MicroChip tone={TIER_TONE[lead.tier]}>Lead · {lead.tier}</MicroChip>
            </div>
            <p className="text-2xs text-ds-text-secondary">{lead.reason}</p>
            <span className="text-2xs text-ds-text-muted">AI signal, not a verdict</span>
          </div>
        ))}
      </div>
    </FragmentCard>
  );
}
