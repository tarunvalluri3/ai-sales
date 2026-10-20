"use client";

import { useActionState, useEffect } from "react";
import { useToast } from "../_components/toast";
import { saveNotificationPreferencesAction, type NotificationPreferencesState } from "./actions";
import type { ResolvedNotificationPreference } from "@/lib/notification-preferences";
import type { NotificationCategory, NotificationEmailMode } from "@/lib/supabase/types";

const CATEGORY_COPY: Record<string, { title: string; description: string }> = {
  human_handover: {
    title: "A conversation needs a human",
    description: "The AI couldn't answer and handed the conversation over. Someone is waiting.",
  },
  appointment_request: {
    title: "New appointment request",
    description: "A prospect asked to book a time. It can't be confirmed without you.",
  },
  appointment_status: {
    title: "Appointment confirmed, declined or cancelled",
    description: "A receipt for your own action, including whether the prospect could actually be emailed.",
  },
  lead_created: {
    title: "New lead",
    description: "A prospect left their contact details. They're on your leads page either way.",
  },
  sla_breach: {
    title: "Missed response target",
    description: "A conversation passed your SLA and was reassigned to the next person.",
  },
  assignment: {
    title: "Assigned to a team member",
    description: "A conversation was routed to someone on your team.",
  },
};

const EMAIL_MODES: { value: NotificationEmailMode; label: string; hint: string }[] = [
  { value: "immediate", label: "Email me now", hint: "Sent the moment it happens" },
  { value: "digest", label: "Daily summary", hint: "Rolled into one email a day" },
  { value: "off", label: "No email", hint: "Dashboard only" },
];

export function NotificationPreferencesForm({
  preferences,
  canEdit,
  hasContactEmail,
}: {
  preferences: ResolvedNotificationPreference[];
  canEdit: boolean;
  hasContactEmail: boolean;
}) {
  const [state, formAction, isPending] = useActionState<NotificationPreferencesState, FormData>(saveNotificationPreferencesAction, {});
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) toast({ title: "Notification settings saved", variant: "success" });
  }, [state.success, toast]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-ds-sm border border-ds-danger bg-ds-danger-bg px-3 py-2 text-sm text-ds-text-primary">
          {state.error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {preferences.map((preference) => (
          <li
            key={preference.category}
            className="flex flex-col gap-3 rounded-ds-md border border-ds-border bg-ds-surface p-4 md:flex-row md:items-start md:justify-between md:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium text-ds-text-primary">{CATEGORY_COPY[preference.category]?.title ?? preference.category}</p>
              <p className="text-sm text-ds-text-secondary">{CATEGORY_COPY[preference.category]?.description}</p>
              <label className="mt-1 flex items-center gap-2 text-sm text-ds-text-secondary">
                <input
                  type="checkbox"
                  name={`in_app_${preference.category}`}
                  defaultChecked={preference.inAppEnabled}
                  disabled={!canEdit}
                  className="size-4 rounded-ds-sm border-ds-border accent-ds-accent"
                />
                Show in the dashboard
              </label>
            </div>

            <fieldset className="flex shrink-0 flex-col gap-1.5" disabled={!canEdit}>
              <legend className="sr-only">Email for {CATEGORY_COPY[preference.category]?.title ?? preference.category}</legend>
              {EMAIL_MODES.map((mode) => {
                // "Email me now" is pointless with nowhere to send it; the page
                // explains why directly above this form.
                const unavailable = mode.value === "immediate" && !hasContactEmail;
                return (
                  <label
                    key={mode.value}
                    className={`flex items-center gap-2 text-sm ${unavailable ? "text-ds-text-muted" : "text-ds-text-secondary"}`}
                  >
                    <input
                      type="radio"
                      name={`email_mode_${preference.category}`}
                      value={mode.value}
                      defaultChecked={preference.emailMode === mode.value}
                      disabled={!canEdit || unavailable}
                      className="size-4 accent-ds-accent"
                    />
                    <span>{mode.label}</span>
                    <span className="text-2xs text-ds-text-muted">{mode.hint}</span>
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-ds-sm bg-dashboard-primary px-4 py-2 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save notification settings"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-ds-text-muted">Only an admin can change these.</p>
      )}
    </form>
  );
}

export type { NotificationCategory };
