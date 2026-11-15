import Link from "next/link";

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
] as const;

export type CopilotTabKey = (typeof TABS)[number]["key"];

/** Same tab strip as AppointmentsTabs, but switches views on the same page via `?tab=` rather than separate routes -- Today/Upcoming/Completed are one feature, not three pages. */
export function CopilotTabs({ active }: { active: CopilotTabKey }) {
  return (
    <div className="dx-tabs" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "today" ? "/dashboard/copilot" : `/dashboard/copilot?tab=${tab.key}`}
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
