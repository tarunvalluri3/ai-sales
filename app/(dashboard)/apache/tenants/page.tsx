import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listTenants, type TenantListFilters } from "@/lib/admin-tenants";
import { PLAN_KEYS } from "@/lib/plans";
import { AdminPageHeader } from "../_components/page-header";
import { TenantList } from "./tenant-list";
import { TenantFilters } from "./tenant-filters";

export default async function ApacheTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string }>;
}) {
  await requirePlatformAdmin("viewer");
  const params = await searchParams;

  const filters: TenantListFilters = {
    search: params.q,
    planKey: PLAN_KEYS.includes(params.plan as (typeof PLAN_KEYS)[number]) ? (params.plan as (typeof PLAN_KEYS)[number]) : undefined,
    status: params.status === "active" || params.status === "suspended" ? params.status : undefined,
  };

  const tenants = await listTenants(filters);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader title="Tenants" description={`${tenants.length} tenant${tenants.length === 1 ? "" : "s"} matching the current filters.`} />
      <TenantFilters initial={params} />
      <TenantList tenants={tenants} />
    </div>
  );
}
