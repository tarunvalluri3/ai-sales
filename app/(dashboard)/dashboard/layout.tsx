import { after } from "next/server";
import { requireBusinessContext } from "@/lib/business-context";
import { ensureClerkOrganizationName } from "@/lib/clerk-org-name";
import { hasMinRole } from "@/lib/auth";
import { listActiveAnnouncementsForCurrentBusiness } from "@/lib/announcements";
import { getAgentPublishStatus, type AgentPublishStatus } from "@/lib/agent-publish-status";
import { getEntitlementForBusiness, type Entitlement } from "@/lib/subscription";
import { logAndGetUserMessage } from "@/lib/errors";
import { Sidebar } from "./_components/sidebar";
import { AttentionProvider } from "./_components/attention-provider";
import { ToastProvider } from "./_components/toast";
import { BusinessTimeProvider } from "./_components/business-time";
import { DashboardHeader } from "./_components/dashboard-header";
import { ContactEmailGate } from "./_components/contact-email-gate";
import { AnnouncementBanner } from "./_components/announcement-banner";
import { SubscriptionBanner } from "./_components/subscription-banner";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { businessId, businessName, contactEmail, orgRole, orgId, timezone } = await requireBusinessContext();
  // Existing accounts whose Clerk org still has a Clerk default name: rename once, best-effort, off the request path.
  if (hasMinRole(orgRole, "org:admin")) after(() => ensureClerkOrganizationName(orgId, businessName));
  const [announcements, entitlement, publishStatus] = await Promise.all([
    listActiveAnnouncementsForCurrentBusiness(),
    // Fail-soft like the publish status: a billing read must never take the
    // dashboard down (getEntitlement already fails open and logs).
    getEntitlementForBusiness(businessId).catch((error: unknown): Entitlement | null => {
      logAndGetUserMessage(error);
      return null;
    }),
    // A header widget must never take the whole dashboard down: on failure the
    // bar shows just the agent's name (logged and reported like any error).
    getAgentPublishStatus(businessId).catch((error: unknown): AgentPublishStatus | null => {
      logAndGetUserMessage(error);
      return null;
    }),
  ]);

  return (
    <ToastProvider>
      <BusinessTimeProvider timezone={timezone}>
      <AttentionProvider>
        {/* `.dash-shell` scopes the dashboard's own light palette, font and
            rounded primitives (globals.css); nothing outside /dashboard has it. */}
        <div className="dash-shell flex min-h-0 flex-1 flex-col">
          <AnnouncementBanner announcements={announcements} />
          {entitlement ? (
            <SubscriptionBanner entitlement={entitlement} canManageBilling={hasMinRole(orgRole, "org:admin")} />
          ) : null}
          <div className="flex min-h-0 flex-1">
            <Sidebar businessName={businessName} />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardHeader
                agentName={businessName}
                publishStatus={publishStatus}
                canPublish={hasMinRole(orgRole, "org:admin")}
              />
              {/* The Draft -> Publish note is rendered by each page's PageHeader. */}
              <main className="dashboard-main flex min-w-0 flex-1 flex-col">{children}</main>
            </div>
          </div>
        </div>
        {/* Every business-facing email depends on contact_email, so a business
            without one silently receives nothing -- the exact failure that
            prompted this work. The value is read on the server; the gate is a
            client component only because a server layout cannot read the
            pathname, and it must not block the very page that fixes it. */}
        <ContactEmailGate hasContactEmail={Boolean(contactEmail)} />
      </AttentionProvider>
      </BusinessTimeProvider>
    </ToastProvider>
  );
}
