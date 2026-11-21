"use client";

import { useEffect, useRef, useState } from "react";
import { Ellipsis, X } from "lucide-react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { clerkDashboardAppearance } from "@/lib/clerk-appearance";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "../../_components/theme-toggle";
import { MobileNav } from "./mobile-nav";
import { PublishBar, type PublishBarStatus } from "./publish-bar";
import { OrgNameRefresh } from "./org-name-refresh";

const MENU_ID = "dashboard-header-menu";

/**
 * The dashboard top bar, rendered from `dashboard/layout.tsx` (not the root
 * layout) so the notification bell sits inside `AttentionProvider` and can
 * read the unread count from the existing poll; hoisting the providers to the
 * root would mount a business-scoped poll on the marketing and sign-in pages.
 *
 * Draft -> Publish -> Live: the left side carries the agent pill and its
 * Live / "Live · Unpublished changes" status, the right side the "Publish
 * changes (N)" button (the one publish control in the dashboard), then
 * the theme toggle, alerts, the organization switcher and the account menu.
 *
 * Below `md` the bar is ONE row (menu button, agent status, Publish, "More"):
 * the theme toggle, alerts, organization switcher and account menu live in a
 * popover behind "More", so the workspace name is never squeezed or cut off.
 * They are mounted once and only re-positioned by CSS, so there are no
 * duplicate Clerk components or notification polls.
 */
export function DashboardHeader({
  agentName,
  publishStatus,
  canPublish,
}: {
  agentName: string;
  publishStatus: PublishBarStatus | null;
  canPublish: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handlePointerDown(event: PointerEvent) {
      // Clerk renders its popovers in a portal outside the wrapper; clicks inside them must not close the menu.
      const target = event.target as Element | null;
      if (target?.closest(".cl-popoverBox, .cl-modalBackdrop, .cl-userButtonPopoverCard, .cl-organizationSwitcherPopoverCard")) return;
      if (wrapperRef.current && target && !wrapperRef.current.contains(target)) setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="relative flex w-full min-h-16 items-center gap-x-2 px-4 py-2 md:flex-wrap md:gap-x-3 md:gap-y-2 lg:px-6">
      <OrgNameRefresh businessName={agentName} />
      <MobileNav businessName={agentName} />
      <PublishBar agentName={agentName} status={publishStatus} canPublish={canPublish} />

      <div ref={wrapperRef} className="md:contents">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          aria-label={menuOpen ? "Close account and settings menu" : "Open account and settings menu"}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary md:hidden"
        >
          {menuOpen ? <X strokeWidth={1.75} className="size-5" aria-hidden="true" /> : <Ellipsis strokeWidth={1.75} className="size-5" aria-hidden="true" />}
        </button>

        <div
          id={MENU_ID}
          className={`${menuOpen ? "flex" : "hidden"} absolute top-full right-4 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] flex-wrap items-center gap-3 rounded-2xl border border-ds-border bg-ds-surface p-4 shadow-lg md:static md:mt-0 md:flex md:w-auto md:flex-nowrap md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
        >
          {/* Same toggle and "theme" storage key as production; size-9 to match the Wave header controls. */}
          <ThemeToggle className="size-9! rounded-xl" />
          <NotificationBell />
          <div className="order-first w-full min-w-0 md:order-none md:w-auto">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/dashboard"
              afterCreateOrganizationUrl="/dashboard"
              appearance={clerkDashboardAppearance}
            />
          </div>
          <UserButton appearance={clerkDashboardAppearance} />
        </div>
      </div>
    </header>
  );
}
