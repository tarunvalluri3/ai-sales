import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getBillingRollup, listSubscriptions } from "@/lib/admin-billing";
import { formatPaiseAsInr2dp } from "@/lib/invoice-format";
import { AdminPageHeader } from "../_components/page-header";
import { AdminKpiTile } from "../_components/admin-kpi-tile";
import { SubscriptionList } from "./subscription-list";

export default async function ApacheBillingPage() {
  await requirePlatformAdmin("viewer");
  const [rollup, subscriptions] = await Promise.all([getBillingRollup(), listSubscriptions()]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader
        title="Subscriptions & Billing"
        description="Platform-wide revenue rollups, built on the existing Razorpay/invoice system (Phase 17) -- no separate billing engine."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiTile label="MRR" value={formatPaiseAsInr2dp(rollup.mrrPaise)} />
        <AdminKpiTile label="ARR" value={formatPaiseAsInr2dp(rollup.arrPaise)} />
        <AdminKpiTile label="ARPU (monthly)" value={formatPaiseAsInr2dp(rollup.arpuPaise)} />
        <AdminKpiTile label="Paying tenants" value={rollup.payingTenantCount} />
      </div>

      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5">
        <h2 className="mb-2 text-sm font-semibold text-ds-text-primary">Subscriptions by status</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          {Object.entries(rollup.byStatus).map(([status, count]) => (
            <span key={status} className="text-ds-text-secondary">
              <span className="font-semibold text-ds-text-primary">{count}</span> {status}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-ds-lg border border-dashed border-ds-border p-4 text-xs text-ds-text-muted">
        Plan overrides and usage-limit overrides are per-tenant actions on each tenant&apos;s own detail page
        (owner-only). Refunds/credit notes are issued via <code className="font-mono">npm run credit-note</code>{" "}
        (dry-run by default) -- deliberately not wired to a button here; see STATE.md for why. Invoices and credit
        notes themselves are visible on each tenant&apos;s own <Link href="/apache/tenants" className="underline">
          Tenants
        </Link>{" "}
        page.
      </div>

      <SubscriptionList subscriptions={subscriptions} />

      <p className="text-xs text-ds-text-muted">
        Expansion MRR, net revenue, and churned-MRR trend charts need historical snapshots that don&apos;t exist
        yet -- Stop 3&apos;s daily rollups will back these (STATE.md), not fabricated from a single current reading.
      </p>
    </div>
  );
}
