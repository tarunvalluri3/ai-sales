"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_GROUPS, isNavItemActive, formatAttentionBadge } from "./nav-items";
import { useAttentionCounts } from "./attention-provider";

/** Maps a nav item's href to its live badge count, if it has one. */
function badgeCountForHref(href: string, counts: { conversationsNeedingAttention: number; pendingAppointments: number }): number {
  if (href === "/dashboard/conversations") return counts.conversationsNeedingAttention;
  if (href === "/dashboard/appointments") return counts.pendingAppointments;
  return 0;
}

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
  const attentionCounts = useAttentionCounts();
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
      className={`hidden h-full shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto scrollbar-hidden border-r border-ds-border bg-ds-surface p-4 transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`mb-6 flex items-center gap-3 ${collapsed ? "justify-center px-0" : "px-2"}`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-ds-sm bg-ds-surface-elevated text-sm font-semibold text-ds-accent">
          {initial}
        </span>
        {collapsed ? null : (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ds-text-primary" title={businessName}>
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
        className={`mb-4 flex size-8 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
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
            <p className="mb-1 px-3 text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const badgeCount = badgeCountForHref(item.href, attentionCounts);
            const showBadge = badgeCount > 0;
            const badgeText = formatAttentionBadge(badgeCount);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? (showBadge ? `${item.label} (${badgeText})` : item.label) : undefined}
                className={`flex items-center gap-3 rounded-ds-sm px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-dashboard-primary text-dashboard-on-primary"
                    : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
                }`}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  <item.icon className="size-3.5" aria-hidden="true" />
                  {showBadge && collapsed ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ds-warning px-0.5 text-[0.6rem] leading-none font-semibold text-ds-bg"
                    >
                      {badgeText}
                    </span>
                  ) : null}
                </span>
                <span className={collapsed ? "sr-only" : "flex-1"}>{item.label}</span>
                {showBadge && !collapsed ? (
                  <span
                    aria-label={`${badgeCount} ${item.href === "/dashboard/appointments" ? "pending appointment" : "conversation"}${badgeCount === 1 ? "" : "s"}`}
                    className="rounded-full bg-ds-warning px-1.5 py-0.5 text-2xs font-semibold text-ds-bg"
                  >
                    {badgeText}
                  </span>
                ) : null}
                {showBadge && collapsed ? (
                  <span className="sr-only">
                    {badgeCount} {item.href === "/dashboard/appointments" ? "pending appointment" : "conversation"}
                    {badgeCount === 1 ? "" : "s"}
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
