import type { SlotGridEntry } from "@/lib/appointments";
import { SlotRowAction } from "./slot-row-action";

/** Booked-pending vs booked-confirmed isn't a distinction worth showing here -- that detail lives on the Requests tab, where it's actually actionable. */
function label(entry: SlotGridEntry): string {
  if (entry.state === "blocked") return "Blocked";
  if (entry.state === "booked_pending" || entry.state === "booked_confirmed") return "Booked";
  return "";
}

const TAG_STYLE = "rounded-ds-sm px-2 py-0.5 text-2xs font-semibold tracking-wide-ds uppercase";

/** One day's slots, open ones plain, booked/blocked ones tagged -- past slots are filtered out before this ever renders (nothing to do with them). A flat divided list, not a card per slot. */
export function SlotGrid({ entries, canEdit }: { entries: SlotGridEntry[]; canEdit: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-ds-text-muted">
        No slots for this date — it falls outside your business hours, or is closed for this date.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-ds-border">
      {entries.map((entry) => (
        <li key={entry.startsAt} className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ds-text-primary">{entry.label}</span>
            {entry.state !== "open" ? (
              <span
                className={`${TAG_STYLE} ${entry.state === "blocked" ? "bg-ds-danger-bg text-ds-danger" : "bg-ds-accent-soft-bg text-ds-accent-muted"}`}
              >
                {label(entry)}
              </span>
            ) : null}
          </div>
          {entry.state === "open" || entry.state === "blocked" ? (
            <SlotRowAction startsAt={entry.startsAt} isBlocked={entry.state === "blocked"} canEdit={canEdit} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
