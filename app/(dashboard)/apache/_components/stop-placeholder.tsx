import { Construction } from "lucide-react";
import { AdminPageHeader } from "./page-header";

/** Rendered by any /apache page whose Phase 33 stop hasn't shipped yet. The page itself still runs behind requirePlatformAdmin() -- this is a placeholder BODY, not a placeholder for the security gate. */
export function StopPlaceholder({ title, stop }: { title: string; stop: 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <AdminPageHeader title={title} description={`Ships in Phase 33, Stop ${stop}.`} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-ds-lg border border-dashed border-ds-border py-16 text-center">
        <Construction className="size-6 text-ds-text-muted" aria-hidden="true" />
        <p className="text-sm text-ds-text-secondary">This section is planned for Stop {stop} of the platform admin panel and hasn&apos;t been built yet.</p>
      </div>
    </div>
  );
}
