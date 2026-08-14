"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, formatAttentionBadge } from "./nav-items";
import { useAttentionCount } from "./attention-provider";

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const attentionCount = useAttentionCount();
  const initial = businessName.trim().charAt(0).toUpperCase() || "?";

  return (
    <nav
      aria-label="Dashboard"
      className="hidden w-64 shrink-0 flex-col gap-1 border-r border-ds-border bg-ds-surface p-4 md:flex"
    >
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-ds-sm bg-ds-surface-elevated text-sm font-semibold text-ds-accent">
          {initial}
        </span>
        <p className="truncate text-sm font-semibold text-ds-text-primary" title={businessName}>
          {businessName}
        </p>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const showBadge = item.href === "/dashboard/conversations" && attentionCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-ds-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
              active
                ? "bg-dashboard-primary text-dashboard-on-primary"
                : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
            }`}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {showBadge ? (
              <span
                aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                className="rounded-full bg-ds-warning px-1.5 py-0.5 text-2xs font-semibold text-ds-bg"
              >
                {formatAttentionBadge(attentionCount)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
