"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_GROUPS, isNavItemActive, formatAttentionBadge } from "./nav-items";
import { useAttentionCount } from "./attention-provider";

const COLLAPSE_STORAGE_KEY = "dashboard-sidebar-collapsed";
// Native "storage" events only fire in *other* tabs, not the tab that wrote
// the value -- this custom event is what makes the toggle below update this
// same tab's sidebar immediately.
const COLLAPSE_CHANGE_EVENT = "dashboard-sidebar-collapse-change";

function setStoredCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private browsing / storage disabled -- the toggle still works for
    // this render via the dispatched event below, just doesn't persist.
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

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const attentionCount = useAttentionCount();
  const initial = businessName.trim().charAt(0).toUpperCase() || "?";

  // useSyncExternalStore (not useState+useEffect) so the persisted
  // preference is read without a server/client hydration mismatch --
  // same pattern this codebase already uses for the onboarding wizard's
  // browser-timezone detection, generalized to a toggle-able value backed
  // by localStorage instead of a one-time computed default.
  const collapsed = useSyncExternalStore(subscribeToCollapsed, getCollapsedSnapshot, getServerCollapsedSnapshot);

  return (
    <nav
      aria-label="Dashboard"
      className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-1 self-start overflow-x-hidden overflow-y-auto scrollbar-hidden border-r border-ds-border bg-ds-surface p-4 transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`mb-6 flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-2"}`}>
        <span className="flex size-8 shrink-0 items-center justify-center bg-ds-surface-elevated text-sm font-medium text-ds-accent">
          {initial}
        </span>
        {collapsed ? null : (
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ds-text-primary" title={businessName}>
            {businessName}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStoredCollapsed(!collapsed)}
        aria-pressed={collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`mb-4 flex size-8 shrink-0 items-center justify-center text-ds-text-secondary transition-colors hover:bg-ds-surface-raised hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary ${
          collapsed ? "self-center" : "self-end"
        }`}
      >
        {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
      </button>

      {NAV_GROUPS.map((group, groupIndex) => (
        <div
          key={group.label ?? `group-${groupIndex}`}
          className={`flex flex-col gap-1 ${groupIndex === 0 ? "" : "mt-4"}`}
        >
          {group.label && !collapsed ? (
            <p className="ds-label mb-1 px-3 text-ds-text-faint">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const showBadge = item.href === "/dashboard/conversations" && attentionCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "border-ds-accent bg-ds-surface-raised text-ds-text-primary"
                    : "border-transparent text-ds-text-secondary hover:bg-ds-surface-raised hover:text-ds-text-primary"
                }`}
              >
                <item.icon className="size-4 shrink-0" strokeWidth={2} strokeLinecap="square" aria-hidden="true" />
                <span className={collapsed ? "sr-only" : "flex-1"}>{item.label}</span>
                {showBadge ? (
                  <span
                    aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                    className="bg-ds-warning px-1.5 py-0.5 text-2xs font-medium text-ds-bg"
                  >
                    {formatAttentionBadge(attentionCount)}
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
