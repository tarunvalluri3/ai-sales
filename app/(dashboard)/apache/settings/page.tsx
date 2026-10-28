import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listPlatformAdminsWithEmail } from "@/lib/admin-team";
import { getPlatformSettingsSnapshot } from "@/lib/admin-settings";
import { AdminPageHeader } from "../_components/page-header";
import { AdminTeamPanel } from "./admin-team-panel";
import { PlatformConfigDisplay } from "./platform-config-display";

export default async function ApacheSettingsPage() {
  const { admin, userId } = await requirePlatformAdmin("viewer");
  const settings = getPlatformSettingsSnapshot();
  const team = admin.role === "owner" ? await listPlatformAdminsWithEmail() : [];

  return (
    <div className="flex flex-1 flex-col gap-8 bg-ds-bg p-6">
      <AdminPageHeader title="Settings" description="Platform admin team, and the current plan/trial/pricing configuration." />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Admin team</h2>
        {admin.role === "owner" ? (
          <AdminTeamPanel team={team} currentUserId={userId} />
        ) : (
          <p className="rounded-ds-lg border border-dashed border-ds-border p-4 text-sm text-ds-text-secondary">
            Only an owner-role admin can view or manage the admin team.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">Plan limits, trial, and pricing</h2>
        <PlatformConfigDisplay settings={settings} />
      </section>
    </div>
  );
}
