import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listAdminAuditLog } from "@/lib/admin-audit-log";
import { AdminPageHeader } from "../_components/page-header";
import { AuditLogFilters } from "./audit-log-filters";
import { AuditLogList } from "./audit-log-list";

export default async function ApacheAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; targetType?: string }>;
}) {
  await requirePlatformAdmin("viewer");
  const params = await searchParams;

  // Two reads: `recent` (unfiltered) only populates the action/target-type
  // dropdown options, so narrowing by one filter never hides the others
  // from the picker. `entries` is the actual filtered, displayed list.
  const [recent, entries] = await Promise.all([
    listAdminAuditLog({ limit: 500 }),
    listAdminAuditLog({ search: params.q, action: params.action, targetType: params.targetType, limit: 500 }),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader title="Audit Log" description={`${entries.length} entr${entries.length === 1 ? "y" : "ies"} matching the current filters, newest first.`} />
      <AuditLogFilters initial={params} recentEntries={recent} />
      <AuditLogList entries={entries} />
    </div>
  );
}
