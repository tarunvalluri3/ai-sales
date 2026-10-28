import { MicroChip } from "./fragments/_shared";

/** Two businesses, two isolated stacks -- hairline boxes, no illustration. */
export function TenantIsolationDiagram() {
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
      <TenantStack name="Business A" />
      <div className="flex flex-row items-center justify-center gap-2 sm:flex-col sm:gap-2">
        <span className="h-px w-8 bg-ds-border sm:h-8 sm:w-px" aria-hidden="true" />
        <MicroChip tone="danger">No shared access</MicroChip>
        <span className="h-px w-8 bg-ds-border sm:h-8 sm:w-px" aria-hidden="true" />
      </div>
      <TenantStack name="Business B" />
    </div>
  );
}

function TenantStack({ name }: { name: string }) {
  return (
    <div className="rounded-ds-lg border border-ds-border-strong p-4">
      <span className="text-xs font-semibold text-ds-text-primary">{name}</span>
      <div className="mt-3 flex flex-col items-stretch gap-2">
        <div className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-center text-2xs text-ds-text-secondary">
          Knowledge base
        </div>
        <span className="mx-auto h-4 w-px bg-ds-border" aria-hidden="true" />
        <div className="rounded-ds-sm border border-ds-accent-muted bg-ds-accent-soft-bg px-3 py-2 text-center text-2xs text-ds-text-primary">
          AI sales employee
        </div>
      </div>
    </div>
  );
}
