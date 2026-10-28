import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listIntegrations } from "@/lib/admin-integrations";
import { AdminPageHeader } from "../_components/page-header";
import { IntegrationsList } from "./integrations-list";

export default async function ApacheIntegrationsPage() {
  await requirePlatformAdmin("viewer");
  const integrations = await listIntegrations();

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <AdminPageHeader title="Integrations Health" description="Every tenant's WhatsApp and Instagram connection, across the platform." />
      <IntegrationsList integrations={integrations} />
    </div>
  );
}
