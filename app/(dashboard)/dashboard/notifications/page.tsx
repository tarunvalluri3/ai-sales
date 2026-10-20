import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireBusinessContext } from "@/lib/business-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listNotificationPreferences } from "@/lib/notification-preferences";
import { NotificationPreferencesForm } from "./notification-preferences-form";

export default async function NotificationsSettingsPage() {
  const { businessId, orgRole, contactEmail } = await requireBusinessContext();
  const supabase = createServerSupabaseClient();
  const preferences = await listNotificationPreferences(supabase, businessId);
  const canEdit = orgRole === "org:admin";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ds-text-primary">Notifications</h1>
        <p className="text-sm text-ds-text-secondary">
          Choose what reaches you immediately, what waits for the daily summary, and what stays in the dashboard only.
        </p>
      </header>

      {contactEmail ? (
        <p className="text-sm text-ds-text-secondary">
          Emails go to <span className="font-medium text-ds-text-primary">{contactEmail}</span>.{" "}
          <Link href="/dashboard/profile" className="font-medium text-ds-accent hover:underline">
            Change it
          </Link>
          .
        </p>
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-ds-md border border-ds-warning bg-ds-surface p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">No alert email set</p>
            <p className="text-sm text-ds-text-secondary">
              Nothing below can be emailed to you until you add one. In-app notifications still work.
            </p>
            <Link href="/dashboard/profile" className="text-sm font-medium text-ds-accent hover:underline">
              Add an alert email
            </Link>
          </div>
        </div>
      )}

      <NotificationPreferencesForm preferences={preferences} canEdit={canEdit} hasContactEmail={Boolean(contactEmail)} />

      <p className="text-sm text-ds-text-muted">
        Workflow steps you built yourself always run, whatever is set here — you asked for those emails explicitly when you built the
        workflow.
      </p>
    </div>
  );
}
