import { FragmentCard, MicroChip } from "./_shared";

const SOURCES = [
  { name: "Pricing FAQ", chunks: 18 },
  { name: "Price List", chunks: 12 },
  { name: "Services Overview.pdf", chunks: 34 },
];

/** Knowledge-source list with chunk counts and index status -- paired with the "Add approved knowledge" step. */
export function KnowledgeSources() {
  return (
    <FragmentCard className="p-4">
      <div className="flex flex-col gap-2">
        {SOURCES.map((source) => (
          <div
            key={source.name}
            className="flex items-center justify-between rounded-ds-sm bg-ds-surface-elevated px-3 py-2"
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium text-ds-text-primary">{source.name}</span>
              <span className="text-2xs text-ds-text-muted">{source.chunks} chunks</span>
            </div>
            <MicroChip tone="success">Indexed</MicroChip>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-ds-border pt-3">
        <MicroChip>Scoped to Lumen Dental Studio only</MicroChip>
      </div>
    </FragmentCard>
  );
}
