import { FragmentCard } from "./_shared";

const SLOTS = ["2:00 PM", "3:15 PM", "4:30 PM", "5:45 PM"];
const SELECTED_SLOT = "4:30 PM";

/** Appointment slot picker that resolves into a confirmation -- the live booking feature. */
export function BookingCard() {
  return (
    <FragmentCard className="p-4">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
        Thursday · Available slots
      </span>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {SLOTS.map((slot) => {
          const selected = slot === SELECTED_SLOT;
          return (
            <span
              key={slot}
              className={`rounded-ds-sm border px-2.5 py-1.5 text-center font-mono text-2xs ${
                selected
                  ? "border-ds-accent bg-ds-accent-soft-bg text-ds-text-primary"
                  : "border-ds-border text-ds-text-muted"
              }`}
            >
              {slot}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-ds-sm border border-ds-border-strong bg-ds-surface-elevated px-3 py-2">
        <span className="text-2xs font-medium text-ds-text-primary">Appointment booked</span>
        <span className="font-mono text-2xs text-ds-text-secondary">Thu · 4:30 PM</span>
      </div>
    </FragmentCard>
  );
}
