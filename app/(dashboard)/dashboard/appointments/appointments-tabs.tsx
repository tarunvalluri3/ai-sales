import Link from "next/link";

const TABS = [
  { key: "requests", label: "Requests", href: "/dashboard/appointments" },
  { key: "availability", label: "Availability", href: "/dashboard/appointments/availability" },
] as const;

/** Sub-navigation between the two appointment views: a visible tab strip, not a link buried in a paragraph. */
export function AppointmentsTabs({ active }: { active: "requests" | "availability" }) {
  return (
    <div className="dx-tabs" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className="dx-tab px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
