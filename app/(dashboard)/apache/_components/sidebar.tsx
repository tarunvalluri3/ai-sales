"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { NAV_GROUPS, isNavItemActive } from "./nav-items";
import type { PlatformAdminRole } from "@/lib/supabase/types";

const COLLAPSE_STORAGE_KEY = "apache-sidebar-collapsed";
const COLLAPSE_CHANGE_EVENT = "apache-sidebar-collapse-change";

function setStoredCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private browsing / storage disabled -- the toggle still works for this render, just doesn't persist.
  }
  window.dispatchEvent(new Event(COLLAPSE_CHANGE_EVENT));
}

function subscribeToCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(COLLAPSE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(COLLAPSE_CHANGE_EVENT, callback);
  };
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerCollapsedSnapshot(): boolean {
  return false;
}

/** Same collapsible pattern as app/(dashboard)/dashboard/_components/sidebar.tsx, reusing the same ds- design tokens, adapted for /apache's own nav shape and a role badge instead of a business name. */
export function AdminSidebar({ role }: { role: PlatformAdminRole }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeToCollapsed, getCollapsedSnapshot, getServerCollapsedSnapshot);

  return (
    <nav
      aria-label="Platform admin"
      className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-1 self-start overflow-x-hidden overflow-y-auto scrollbar-hidden border-r border-ds-border bg-ds-surface p-4 transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`mb-6 flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-2"}`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-ds-sm bg-ds-surface-elevated text-ds-accent">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ds-text-primary">Platform admin</p>
            <p className="truncate text-2xs text-ds-text-muted capitalize">{role}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStoredCollapsed(!collapsed)}
        aria-pressed={collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`mb-4 flex size-8 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
          collapsed ? "self-center" : "self-end"
        }`}
      >
        {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
      </button>

      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.label ?? `group-${groupIndex}`} className={`flex flex-col gap-1 ${groupIndex === 0 ? "" : "mt-4"}`}>
          {group.label && !collapsed ? (
            <p className="mb-1 px-3 text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">{group.label}</p>
          ) : null}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-ds-sm px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-dashboard-primary text-dashboard-on-primary"
                    : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
                }`}
              >
                <item.icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className={collapsed ? "sr-only" : "flex-1"}>{item.label}</span>
                {item.stop > 1 && !collapsed ? (
                  <span className="rounded-full bg-ds-surface-soft px-1.5 py-0.5 text-2xs font-medium text-ds-text-muted">
                    Stop {item.stop}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
