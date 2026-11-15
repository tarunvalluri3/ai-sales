import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bell, Mail, Workflow } from "lucide-react";
import { PageHeader, linkAccent } from "../_components/ui";
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
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        icon={Bell}
        title="Notifications"
        description="Choose what reaches you now, what waits for a summary, and what stays in your dashboard."
      />

      {contactEmail ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-ds-surface-soft px-5 py-3.5">
          <p className="flex items-center gap-4 text-sm font-medium text-ds-text-primary">
            <Mail className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              Emails go to <span className="break-all">{contactEmail}</span>
            </span>
          </p>
          <Link href="/dashboard/profile" className={`${linkAccent} border-l border-ds-primary/20 pl-6 text-base underline`}>
            Change email
            <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
          </Link>
          <p className="border-l border-ds-primary/20 pl-6 text-sm text-ds-text-primary">
            Update the contact email on your business profile.
          </p>
        </div>
      ) : (
        <div role="status" className="flex items-start gap-4 rounded-2xl bg-ds-warning-bg px-5 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-ds-warning" strokeWidth={1.75} aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ds-text-primary">No alert email set</p>
            <p className="text-sm text-ds-text-primary">
              Nothing below can be emailed to you until you add one. In-app notifications still work.
            </p>
            <Link href="/dashboard/profile" className={`${linkAccent} w-fit text-base underline`}>
              Add an alert email
              <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      <NotificationPreferencesForm preferences={preferences} canEdit={canEdit} hasContactEmail={Boolean(contactEmail)} />

      <p className="dx-card flex items-center gap-4 px-5 py-4 text-sm text-ds-text-primary">
        <Workflow className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Workflow email steps run independently of these preferences: you asked for those emails explicitly when you built the workflow.
      </p>
    </div>
  );
}
