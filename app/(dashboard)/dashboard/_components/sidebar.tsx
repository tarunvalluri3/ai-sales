"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, formatAttentionBadge } from "./nav-items";
import { useAttentionCount } from "./attention-provider";

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const attentionCount = useAttentionCount();

  return (
    <nav
      aria-label="Dashboard"
      className="hidden w-60 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-zinc-50 p-4 md:flex"
    >
      <p className="mb-4 truncate px-2 text-sm font-semibold text-zinc-900" title={businessName}>
        {businessName}
      </p>
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const showBadge = item.href === "/dashboard/conversations" && attentionCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-dashboard-primary text-dashboard-on-primary"
                : "text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {showBadge ? (
              <span
                aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white"
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
