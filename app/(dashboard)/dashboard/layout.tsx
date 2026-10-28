import { requireBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { listActiveAnnouncementsForCurrentBusiness } from "@/lib/announcements";
import { getAgentPublishStatus, type AgentPublishStatus } from "@/lib/agent-publish-status";
import { getEntitlementForBusiness, type Entitlement } from "@/lib/subscription";
import { logAndGetUserMessage } from "@/lib/errors";
import { Sidebar } from "./_components/sidebar";
import { MobileNav } from "./_components/mobile-nav";
import { AttentionProvider } from "./_components/attention-provider";
import { ToastProvider } from "./_components/toast";
import { DashboardHeader } from "./_components/dashboard-header";
import { DraftNote } from "./_components/draft-note";
import { ContactEmailGate } from "./_components/contact-email-gate";
import { AnnouncementBanner } from "./_components/announcement-banner";
import { SubscriptionBanner } from "./_components/subscription-banner";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { businessId, businessName, contactEmail, orgRole } = await requireBusinessContext();
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
      <AttentionProvider>
        <div className="flex min-h-0 flex-1 flex-col">
          <AnnouncementBanner announcements={announcements} />
          {entitlement ? (
            <SubscriptionBanner entitlement={entitlement} canManageBilling={hasMinRole(orgRole, "org:admin")} />
          ) : null}
          <DashboardHeader
            agentName={businessName}
            publishStatus={publishStatus}
            canPublish={hasMinRole(orgRole, "org:admin")}
          />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <Sidebar businessName={businessName} />
            <MobileNav businessName={businessName} />
            <main className="flex min-w-0 flex-1 flex-col">
              <DraftNote />
              {children}
            </main>
          </div>
        </div>
        {/* Every business-facing email depends on contact_email, so a business
            without one silently receives nothing -- the exact failure that
            prompted this work. The value is read on the server; the gate is a
            client component only because a server layout cannot read the
            pathname, and it must not block the very page that fixes it. */}
        <ContactEmailGate hasContactEmail={Boolean(contactEmail)} />
      </AttentionProvider>
    </ToastProvider>
  );
}
