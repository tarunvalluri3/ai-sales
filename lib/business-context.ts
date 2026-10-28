import "server-only";
import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";

export type BusinessContext = {
  userId: string;
  orgId: string;
  orgRole: string | undefined;
  businessId: string;
  businessName: string;
  /** Where every business-facing email goes. Null means the business receives none -- the dashboard gates on this. Free to expose: `getBusinessForOrg` already fetches the whole row. */
  contactEmail: string | null;
  /** True once the business has published its AI (`published_at` is set) -- the single "live" signal. Gates the operational dashboard pages via `requireLiveBusinessContext` below. */
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
  if (business.deleted_at || business.status === "suspended") {
    redirect("/suspended");
  }

  return {
    userId: context.userId,
    orgId: context.orgId,
    orgRole: context.orgRole,
    businessId: business.id,
    businessName: business.name,
    contactEmail: business.contact_email,
    published: business.published_at != null,
  };
}

/**
 * Onboarding route guard: for the "operational" dashboard pages
 * (conversations, leads, customers, analytics, copilot, audit log,
 * answer bank, workflows, appointments) that only make sense once the AI
 * is actually facing prospects. A business that exists but hasn't
 * published yet is sent to the readiness checklist + publish button
 * (`/dashboard/widget-settings`) instead -- never to `/onboarding`, since
 * the setup pages (profile, products, services, faqs, knowledge,
 * business-hours, widget-settings, billing, instagram, whatsapp,
 * webhooks) that a business needs to actually become ready stay
 * reachable through `requireBusinessContext` the whole time. Reuses the
 * same `getBusinessForOrg` call `requireBusinessContext` already makes
 * (memoized via `cache()`), so this adds no extra query per navigation.
 */
export async function requireLiveBusinessContext(): Promise<BusinessContext> {
  const context = await requireBusinessContext();
  if (!context.published) {
    redirect("/dashboard/widget-settings");
  }
  return context;
}
