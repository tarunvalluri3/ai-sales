import type { ReactNode } from "react";

/** Minimal browser chrome, built from `ds-*` tokens -- frames a real product screenshot. */
export function BrowserFrame({ children, urlLabel }: { children: ReactNode; urlLabel: string }) {
  return (
    <div className="overflow-hidden border border-ds-border-strong bg-ds-surface">
      <div className="flex items-center gap-3 border-b border-ds-border bg-ds-surface-raised px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-ds-border-strong" />
          <span className="size-2 rounded-full bg-ds-border-strong" />
          <span className="size-2 rounded-full bg-ds-border-strong" />
        </div>
        <span className="truncate bg-ds-surface px-2.5 py-1 font-mono text-2xs text-ds-text-muted">
          {urlLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
