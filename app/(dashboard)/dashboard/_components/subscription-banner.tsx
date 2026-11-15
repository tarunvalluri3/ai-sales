import Link from "next/link";
import type { Entitlement } from "@/lib/subscription";

/** Customers are India-only for v1, so dates are shown in IST (same as the billing page). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * The global billing banner on /dashboard/*. A lapsed subscription never locks
 * the dashboard -- the owner must still reach their leads and the billing page
 * -- so this is the only thing that tells them the agent is affected.
 *
 *  - `past_due` and still serving: the agent is live through the grace period.
 *  - not serving (expired, cancelled past its paid period, expired trial,
 *    grace lapsed): the agent is paused.
 *
 * Both lead to /dashboard/billing. Billing is org:admin only, so other roles
 * get the same message with a pointer to an admin instead of a dead link.
 */
export function SubscriptionBanner({
  entitlement,
  canManageBilling,
}: {
  entitlement: Pick<Entitlement, "status" | "serving" | "graceUntil">;
  canManageBilling: boolean;
}) {
  let message: string;
  let cta: string;
  let tone: string;

  if (!entitlement.serving) {
    message = "Your agent is paused. Choose a plan to go live again.";
    cta = "Choose a plan";
    tone = "bg-ds-danger-bg text-ds-danger";
  } else if (entitlement.status === "past_due" && entitlement.graceUntil) {
    message = `Payment failed — your agent stays live until ${formatDate(entitlement.graceUntil)}.`;
    cta = "Update payment method";
    tone = "bg-ds-warning-bg text-ds-warning";
  } else {
    return null;
  }

  return (
    <div role="alert" className={`mx-4 mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5 text-sm md:mx-6 ${tone}`}>
      <span>{message}</span>
      {canManageBilling ? (
        <Link
          href="/dashboard/billing"
          className="ds-btn-label inline-flex h-9 shrink-0 items-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {cta}
        </Link>
      ) : (
        <span className="shrink-0 text-xs">Ask an organisation admin to open Billing.</span>
      )}
    </div>
  );
}
