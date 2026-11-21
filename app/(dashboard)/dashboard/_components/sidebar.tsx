"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { ThemedWavesLogo } from "../../_components/waves-logo";
import { NAV_GROUPS, isNavItemActive, formatAttentionBadge, type NavGroup } from "./nav-items";
import { useAttentionCount } from "./attention-provider";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary";

/* Collapse state: same key, event and pattern as the deployed (main) sidebar,
   so a saved preference carries over. */
const COLLAPSE_STORAGE_KEY = "dashboard-sidebar-collapsed";
// Native "storage" events only fire in *other* tabs, not the tab that wrote
// the value -- this custom event is what makes the toggle update this same
// tab's sidebar immediately.
const COLLAPSE_CHANGE_EVENT = "dashboard-sidebar-collapse-change";

function setStoredCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private browsing / storage disabled -- the toggle still works for this
    // page via the dispatched event below, it just doesn't persist.
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

/**
 * The grouped nav itself, shared by the desktop sidebar and the mobile drawer
 * so the two can never drift. "Knowledge Base" and "Settings" are disclosure
 * groups; Settings starts closed and opens itself whenever a page inside it is
 * the current one, so the active item is never hidden.
 *
 * `collapsed` (desktop icon rail): headings and disclosure buttons are hidden
 * and every item of every group shows as an icon, so no page is unreachable.
 */
export function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const attentionCount = useAttentionCount();
  // Only what the user explicitly toggled; everything else is derived from the
  // group's default and the current path, so there is no effect to keep in sync.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  function isOpen(group: NavGroup): boolean {
    if (collapsed || !group.collapsible || !group.label) return true;
    const explicit = toggled[group.label];
    if (explicit !== undefined) return explicit;
    if (!group.defaultCollapsed) return true;
    return group.items.some((item) => isNavItemActive(pathname, item.href));
  }

  return (
    <>
      {NAV_GROUPS.map((group, groupIndex) => {
        const open = isOpen(group);
        const groupId = `nav-group-${groupIndex}`;
        const isSettings = group.label === "Settings";

        return (
          <div
            key={group.label ?? groupId}
            className={`flex flex-col gap-0.5 ${
              groupIndex === 0 ? "" : collapsed ? "mt-3 border-t border-ds-border pt-3" : isSettings ? "mt-4 border-t border-ds-border pt-3" : "mt-4"
            }`}
          >
            {group.label && !collapsed ? (
              group.collapsible ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={groupId}
                  onClick={() => setToggled((current) => ({ ...current, [group.label as string]: !open }))}
                  className={`flex min-h-9 items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-ds-surface-soft ${FOCUS}`}
                >
                  {isSettings ? <Settings className="size-4 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
                  <span className={isSettings ? "flex-1 text-sm font-medium text-ds-text-primary" : "ds-section-label flex-1"}>
                    {group.label}
                  </span>
                  <ChevronDown strokeWidth={1.75}
                    className={`size-4 shrink-0 text-ds-text-primary transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <p className="ds-section-label mb-1 px-3">{group.label}</p>
              )
            ) : null}

            {open ? (
              <ul id={groupId} className={`flex flex-col gap-0.5 ${isSettings && !collapsed ? "pl-3" : ""}`}>
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const showBadge = item.href === "/dashboard/conversations" && attentionCount > 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex min-h-9 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${FOCUS} ${
                          collapsed ? "justify-center" : ""
                        } ${
                          active
                            ? "bg-ds-lime-mid font-medium text-ds-text-primary"
                            : "text-ds-text-primary hover:bg-ds-surface-soft"
                        }`}
                      >
                        <item.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{item.label}</span>
                        {showBadge && collapsed ? (
                          <span
                            aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ds-attention"
                          />
                        ) : showBadge ? (
                          <span
                            aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                            className="inline-flex min-w-6 items-center justify-center rounded-full bg-ds-attention px-1.5 py-0.5 text-2xs font-medium text-ds-on-bright"
                          >
                            {formatAttentionBadge(attentionCount)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Brand lockup + the workspace (business) this dashboard belongs to. */
export function SidebarBrand({
  businessName,
  collapsed = false,
  toggle,
}: {
  businessName: string;
  collapsed?: boolean;
  /** Desktop only: the collapse/expand button, placed in the brand row. */
  toggle?: ReactNode;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Link href="/dashboard" title="Overview" className={`flex size-9 items-center justify-center rounded-lg ${FOCUS}`}>
          <ThemedWavesLogo compact />
        </Link>
        {toggle}
        <div className="flex w-full justify-center border-b border-ds-border pb-3" title={businessName}>
          <Building2 className="size-4 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Workspace: {businessName}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/dashboard" className={`flex min-w-0 items-center rounded-lg px-2 ${FOCUS}`}>
          <ThemedWavesLogo />
        </Link>
        {toggle}
      </div>
      <div className="flex flex-col gap-1 border-b border-ds-border px-2 pb-4">
        <p className="text-xs font-medium text-ds-text-secondary">Workspace</p>
        <p className="flex items-center gap-2 text-sm font-medium text-ds-text-primary" title={businessName}>
          <Building2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">{businessName}</span>
        </p>
      </div>
    </div>
  );
}

export function Sidebar({ businessName }: { businessName: string }) {
  // useSyncExternalStore (not useState+useEffect) so the persisted preference
  // is read without a server/client hydration mismatch -- same as main.
  const collapsed = useSyncExternalStore(subscribeToCollapsed, getCollapsedSnapshot, getServerCollapsedSnapshot);

  const toggle = (
    <button
      type="button"
      onClick={() => setStoredCollapsed(!collapsed)}
      aria-pressed={collapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary ${FOCUS}`}
    >
      {collapsed ? (
        <PanelLeftOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <PanelLeftClose className="size-4" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <nav
      aria-label="Dashboard"
      className={`scrollbar-hidden sticky top-0 hidden h-screen shrink-0 flex-col gap-4 self-start overflow-x-hidden overflow-y-auto border-r border-ds-border bg-ds-surface py-5 transition-[width] duration-200 md:flex ${
        collapsed ? "w-16 px-3" : "w-64 px-4"
      }`}
    >
      <SidebarBrand businessName={businessName} collapsed={collapsed} toggle={toggle} />
      <div className="flex flex-col">
        <NavList collapsed={collapsed} />
      </div>
    </nav>
  );
}
