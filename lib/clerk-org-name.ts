import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { looksLikeClerkOrganizationDefault } from "@/lib/schemas/business";

/**
 * Keeps the Clerk organization's display name (the top-right organization
 * switcher) in step with the business name. Best-effort by design: a Clerk
 * failure is logged and swallowed, it must never block saving the business.
 *
 * SECURITY: `orgId` must be the validated session's org (requireAuthContext /
 * requireBusinessContext), never a value read from a form or request body.
 */
export async function syncClerkOrganizationName(orgId: string, businessName: string): Promise<void> {
  const name = businessName.trim();
  if (!orgId || !name) return;
  try {
    const clerk = await clerkClient();
    const organization = await clerk.organizations.getOrganization({ organizationId: orgId });
    if (organization.name === name) return;
    await clerk.organizations.updateOrganization(orgId, { name });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "clerk_org_rename_failed",
        message: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/** Org ids already checked by this server instance, so the backfill below costs one Clerk read per org per instance. */
const checkedOrgIds = new Set<string>();

/**
 * Backfill for accounts created before the rename existed: when the Clerk
 * organization still carries a Clerk default name ("My Organization",
 * "<name>'s Organization") and the business has a real name, rename it. A real
 * custom Clerk name is never overwritten here.
 */
export async function ensureClerkOrganizationName(orgId: string, businessName: string): Promise<void> {
  const name = businessName.trim();
  if (!orgId || !name || checkedOrgIds.has(orgId) || looksLikeClerkOrganizationDefault(name)) return;
  checkedOrgIds.add(orgId);
  try {
    const clerk = await clerkClient();
    const organization = await clerk.organizations.getOrganization({ organizationId: orgId });
    if (!looksLikeClerkOrganizationDefault(organization.name)) return;
    await clerk.organizations.updateOrganization(orgId, { name });
  } catch (error) {
    checkedOrgIds.delete(orgId);
    console.error(
      JSON.stringify({
        event: "clerk_org_backfill_failed",
        message: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
