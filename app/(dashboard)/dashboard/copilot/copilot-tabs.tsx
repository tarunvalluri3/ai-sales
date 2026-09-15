import Link from "next/link";

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
] as const;

export type CopilotTabKey = (typeof TABS)[number]["key"];

/** Same visual/route convention as AppointmentsTabs, but switches views on the same page via `?tab=` rather than separate routes -- Today/Upcoming/Completed are one feature, not three pages. */
export function CopilotTabs({ active }: { active: CopilotTabKey }) {
  return (
    <div className="flex items-center gap-1 border-b border-ds-border" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "today" ? "/dashboard/copilot" : `/dashboard/copilot?tab=${tab.key}`}
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
