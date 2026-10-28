import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listTenants } from "@/lib/admin-tenants";
import { listAnnouncements } from "@/lib/admin-announcements";
import { AdminPageHeader } from "../_components/page-header";
import { ImpersonationPanel } from "./impersonation-panel";
import { AnnouncementsPanel } from "./announcements-panel";

export default async function ApacheSupportPage() {
  await requirePlatformAdmin("support");
  const [tenants, announcements] = await Promise.all([listTenants(), listAnnouncements()]);
  const tenantOptions = tenants.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <AdminPageHeader title="Support Tools" description="Time-boxed, read-only tenant impersonation and platform-wide announcements." />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Impersonate a tenant</h2>
        <ImpersonationPanel tenants={tenantOptions} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Announcements</h2>
        <AnnouncementsPanel announcements={announcements} tenants={tenantOptions} />
      </section>
    </div>
  );
}
