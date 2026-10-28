import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getTenantDetail } from "@/lib/admin-tenants";
import { listAdminAuditLog } from "@/lib/admin-audit-log";
import { AdminBreadcrumbs } from "../../_components/breadcrumbs";
import { AdminPageHeader } from "../../_components/page-header";
import { TenantDetailTabs } from "./tenant-detail-tabs";
import { TenantActionsBar } from "./tenant-actions-bar";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requirePlatformAdmin("viewer");
  const { id } = await params;

  const detail = await getTenantDetail(id);
  if (!detail) notFound();

  // This page's "Activity" tab reads the existing audit trail -- it does
  // NOT itself write a view-audit row. The approved security brief's
  // "every view of customer conversation content writes to it" applies to
  // the actual transcript viewer (Stop 4's Conversations section), not
  // this tenant-profile summary (business/plan/usage counts, no prospect
  // message content).
  const auditLog = await listAdminAuditLog({ businessId: id, limit: 50 });

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminBreadcrumbs trail={[{ label: "Tenants", href: "/apache/tenants" }, { label: detail.business.name }]} />
      <AdminPageHeader
        title={detail.business.name}
        description={detail.business.clerk_org_id}
        actions={<TenantActionsBar tenant={detail} adminRole={admin.role} />}
      />
      <TenantDetailTabs detail={detail} auditLog={auditLog} />
    </div>
  );
}
