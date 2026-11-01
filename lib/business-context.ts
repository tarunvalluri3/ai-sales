import "server-only";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";
import { isAgentPublished } from "@/lib/agent-published";
import { businessLifecycleBlock } from "@/lib/business-lifecycle";

export type BusinessContext = {
  userId: string;
  orgId: string;
  orgRole: string | undefined;
  businessId: string;
  businessName: string;
  /** Where every business-facing email goes. Null means the business receives none -- the dashboard gates on this. Free to expose: `getBusinessForOrg` already fetches the whole row. */
  contactEmail: string | null;
  /** True once the business has published its AI -- `isAgentPublished` (lib/agent-published.ts), the single "live" signal the widget API also uses. Gates the operational dashboard pages via `requireLiveBusinessContext` below. */
  published: boolean;
};

/**
 * Resolves the validated `{ userId, businessId }` pair for the current
 * request, per docs/security.md §2. Redirects (does not throw) when the
 * caller has no organization or no business yet, matching the existing
 * gating in app/dashboard/page.tsx and app/onboarding/page.tsx. Every
 * products/services/FAQs page and Server Action should resolve
 * `businessId` through this helper, never from client input.
 */
export async function requireBusinessContext(): Promise<BusinessContext> {
  const context = await requireAuthContext();

  if (!context.orgId) {
    redirect("/session-tasks/choose-organization");
  }

  const business = await getBusinessForOrg(context.orgId);
  if (!business) {
    redirect("/onboarding");
  }

  // Phase 33 Stop 2 (docs/phases.md): a platform admin's suspend/soft-delete
  // action must actually block dashboard access, not just mark a column.
  // Checked here (the one place every dashboard page/Server Action already
  // resolves businessId through) rather than per-page.
  if (businessLifecycleBlock(business)) {
    redirect("/suspended");
  }

  return {
    userId: context.userId,
    orgId: context.orgId,
    orgRole: context.orgRole,
    businessId: business.id,
    businessName: business.name,
    contactEmail: business.contact_email,
    published: isAgentPublished(business),
  };
}

/**
 * Onboarding route guard: for the "operational" dashboard pages
 * (conversations, leads, customers, analytics, copilot, audit log,
 * answer bank, workflows, appointments) that only make sense once the AI
 * is actually facing prospects. A business that exists but hasn't
 * published yet is sent to the setup wizard, where readiness, testing and
 * publishing live (2026-10-29 redesign) -- `/onboarding` resumes at the
 * right step and itself redirects back here once published. Both sides read
 * the same `published` flag (lib/agent-published.ts), so they can never
 * bounce between each other. The setup pages (profile, products, services,
 * faqs, knowledge, business-hours, widget-settings, billing, instagram,
 * whatsapp, webhooks) stay reachable through `requireBusinessContext` the
 * whole time. Reuses the same `getBusinessForOrg` call
 * `requireBusinessContext` already makes (memoized via `cache()`), so this
 * adds no extra query per navigation.
 */
export async function requireLiveBusinessContext(): Promise<BusinessContext> {
  const context = await requireBusinessContext();
  if (!context.published) {
    redirect("/onboarding");
  }
  return context;
}
