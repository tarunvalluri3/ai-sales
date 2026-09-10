import Link from "next/link";

const TABS = [
  { key: "requests", label: "Requests", href: "/dashboard/appointments" },
  { key: "availability", label: "Availability", href: "/dashboard/appointments/availability" },
] as const;

/** Sub-navigation between the two appointment views -- the primary fix for "couldn't find Availability": a visible tab, not a link buried in a paragraph. */
export function AppointmentsTabs({ active }: { active: "requests" | "availability" }) {
  return (
    <div className="flex items-center gap-1 border-b border-ds-border" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
            active === tab.key
              ? "border-ds-accent text-ds-text-primary"
              : "border-transparent text-ds-text-secondary hover:text-ds-text-primary"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
