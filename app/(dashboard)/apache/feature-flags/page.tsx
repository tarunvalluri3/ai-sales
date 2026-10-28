import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listFeatureFlags } from "@/lib/feature-flags";
import { listTenants } from "@/lib/admin-tenants";
import { AdminPageHeader } from "../_components/page-header";
import { FeatureFlagsPanel } from "./feature-flags-panel";

export default async function ApacheFeatureFlagsPage() {
  const { admin } = await requirePlatformAdmin("viewer");
  const [flags, tenants] = await Promise.all([listFeatureFlags(), listTenants()]);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader title="Feature Flags" description="A global default per flag, with optional per-tenant overrides." />
      <FeatureFlagsPanel
        flags={flags}
        tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
        canDelete={admin.role === "owner"}
      />
    </div>
  );
}
