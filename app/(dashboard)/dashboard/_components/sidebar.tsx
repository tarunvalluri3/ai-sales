"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();

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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
