"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { clerkDashboardAppearance } from "@/lib/clerk-appearance";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "../../_components/theme-toggle";
import { MobileNav } from "./mobile-nav";
import { PublishBar, type PublishBarStatus } from "./publish-bar";
import { OrgNameRefresh } from "./org-name-refresh";

/**
 * The dashboard top bar, rendered from `dashboard/layout.tsx` (not the root
 * layout) so the notification bell sits inside `AttentionProvider` and can
 * read the unread count from the existing poll; hoisting the providers to the
 * root would mount a business-scoped poll on the marketing and sign-in pages.
 *
 * Draft -> Publish -> Live: the left side carries the agent pill and its
 * Live / "Live · Unpublished changes" status, the right side the "Publish
 * changes (N)" button (the one publish control in the dashboard), then
 * alerts, the organization switcher and the account menu. The dashboard is
 * light only, so there is no theme toggle here.
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
  return (
    <header className="flex w-full min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 lg:px-6">
      <OrgNameRefresh businessName={agentName} />
      <MobileNav businessName={agentName} />
      <PublishBar agentName={agentName} status={publishStatus} canPublish={canPublish} />
      <div className="flex items-center gap-3">
        {/* Same toggle and "theme" storage key as production; size-9 to match the Wave header controls. */}
        <ThemeToggle className="size-9! rounded-xl" />
        <NotificationBell />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          appearance={clerkDashboardAppearance}
        />
        <UserButton appearance={clerkDashboardAppearance} />
      </div>
    </header>
  );
}
