"use server";

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listTenants, tenantsToCsv, type TenantListFilters } from "@/lib/admin-tenants";

export async function exportTenantsCsvAction(filters: TenantListFilters): Promise<{ csv: string | null; error: string | null }> {
  await requirePlatformAdmin("viewer");
  try {
    const tenants = await listTenants(filters);
    return { csv: tenantsToCsv(tenants), error: null };
  } catch {
    return { csv: null, error: "Something went wrong preparing the export." };
  }
}
