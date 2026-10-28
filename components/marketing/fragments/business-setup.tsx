import { FragmentCard, MicroChip } from "./_shared";

const CATALOG = ["Teeth Whitening — ₹4,500", "Invisible Aligners — ₹65,000", "Root Canal — ₹6,000"];

/** Compact business-identity + catalog form -- paired with the "Configure your business" step. */
export function BusinessSetup() {
  return (
    <FragmentCard className="p-4">
      <div className="flex items-center justify-between border-b border-ds-border pb-3">
        <span className="text-xs font-semibold text-ds-text-primary">Lumen Dental Studio</span>
        <MicroChip tone="success">Published</MicroChip>
      </div>
      <div className="flex flex-col gap-3 pt-3">
        <Field label="Description" value="Dental clinic, Hyderabad. Cosmetic, orthodontic and general dentistry." />
        <Field label="Contact" value="hello@lumendental.in · +91 90000 00000" />
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
            Products &amp; services
          </span>
          <ul className="flex flex-col gap-1">
            {CATALOG.map((item) => (
              <li
                key={item}
                className="rounded-ds-sm bg-ds-surface-elevated px-2.5 py-1.5 text-xs text-ds-text-secondary"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FragmentCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{label}</span>
      <span className="text-xs text-ds-text-secondary">{value}</span>
    </div>
  );
}
