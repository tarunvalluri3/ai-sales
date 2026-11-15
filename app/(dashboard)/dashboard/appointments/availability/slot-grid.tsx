import { Info } from "lucide-react";
import type { SlotGridEntry } from "@/lib/appointments";
import { SlotRowAction } from "./slot-row-action";

/** Booked-pending vs booked-confirmed isn't a distinction worth showing here -- that detail lives on the Requests tab, where it's actually actionable. */
function stateLabel(entry: SlotGridEntry): string {
  if (entry.state === "blocked") return "Blocked";
  if (entry.state === "booked_pending" || entry.state === "booked_confirmed") return "Booked";
  return "Available";
}

function tileClass(entry: SlotGridEntry): string {
  if (entry.state === "blocked") return "border-ds-attention/60 bg-ds-warning-bg";
  if (entry.state === "booked_pending" || entry.state === "booked_confirmed") return "border-transparent bg-ds-mark-neutral/25";
  return "border-ds-border-strong bg-ds-surface";
}

const LEGEND = [
  { label: "Available", swatch: "border border-ds-border-strong bg-ds-surface" },
  { label: "Booked", swatch: "bg-ds-mark-neutral/50" },
  { label: "Blocked", swatch: "bg-ds-attention" },
];

/**
 * One day's slots as a two-column grid of tiles: white = available (with a
 * Block button), amber = blocked (with Unblock), grey = booked (no action;
 * booked slots cannot be blocked). Past slots are filtered out before this
 * ever renders.
 */
export function SlotGrid({ entries, canEdit }: { entries: SlotGridEntry[]; canEdit: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
        No slots for this date. It falls outside your business hours, or is closed for this date.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap items-center gap-x-8 gap-y-2" aria-label="Slot legend">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm text-ds-text-primary">
            <span aria-hidden="true" className={`size-5 rounded-full ${item.swatch}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <li
            key={entry.startsAt}
            className={`flex min-h-[3.75rem] items-center justify-between gap-3 rounded-xl border px-4 py-2 ${tileClass(entry)}`}
          >
            <div className="flex flex-col">
              <span className="text-sm leading-tight font-medium text-ds-text-primary">{entry.label}</span>
              <span className="text-sm text-ds-text-secondary">{stateLabel(entry)}</span>
            </div>
            {entry.state === "open" || entry.state === "blocked" ? (
              <SlotRowAction startsAt={entry.startsAt} isBlocked={entry.state === "blocked"} canEdit={canEdit} />
            ) : null}
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-sm text-ds-text-secondary">
        <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Booked slots cannot be blocked.
      </p>
    </div>
  );
}
