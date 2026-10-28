import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth";
import { getBusinessForOrg } from "@/lib/business";

/**
 * Where lib/business-context.ts's requireBusinessContext() redirects a
 * suspended or soft-deleted tenant (Phase 33 Stop 2, docs/phases.md).
 * Deliberately resolves the business directly (not through
 * requireBusinessContext()) -- calling that here would redirect right
 * back to this same page.
 */
export default async function SuspendedPage() {
  const context = await requireAuthContext();
  if (!context.orgId) redirect("/session-tasks/choose-organization");

  const business = await getBusinessForOrg(context.orgId);
  if (!business) redirect("/onboarding");
  if (business.status !== "suspended" && !business.deleted_at) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6">
      <div className="flex max-w-md flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-ds-text-primary">This account is suspended</h1>
        <p className="text-sm text-ds-text-secondary">
          Access to the dashboard and the AI sales employee has been suspended for {business.name}. If you believe
          this is a mistake, contact support.
        </p>
      </div>
    </div>
  );
}
