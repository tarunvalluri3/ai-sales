"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";
import { NotificationBell } from "./notification-bell";
import { PublishBar, type PublishBarStatus } from "./publish-bar";

/**
 * The dashboard's top bar. Visually identical to the branch it replaced in
 * `app/(dashboard)/_components/site-header.tsx`, but rendered from
 * `dashboard/layout.tsx` instead of the root layout.
 *
 * It had to move. `SiteHeader` lives in the root layout, which is *outside*
 * `AttentionProvider`, so a bell rendered there could not read the unread
 * count. The alternative -- hoisting the providers up to the root layout --
 * would mount a business-scoped 1-second poll on the marketing homepage and
 * the sign-in pages, where `requireBusinessContext()` redirects anyone without
 * an organization. Moving the chrome that genuinely belongs to the dashboard
 * into the dashboard is the smaller and safer change.
 *
 * Draft -> Publish -> Live (2026-10-29): the left side carries the agent's
 * name, its Live / "Live · Unpublished changes" pill and the "Publish
 * changes (N)" button -- the dashboard's one publish control.
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
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ds-border bg-ds-surface px-4 py-2.5">
      <PublishBar agentName={agentName} status={publishStatus} canPublish={canPublish} />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          appearance={clerkDarkCompactAppearance}
        />
        <UserButton appearance={clerkDarkCompactAppearance} />
      </div>
    </header>
  );
}
