"use client";

import { useActionState, useEffect } from "react";
import { CalendarCheck, CalendarDays, Clock, Lock, MessageCircle, UserRound, Users } from "lucide-react";
import { useToast } from "../_components/toast";
import { btnPrimary } from "../_components/ui";
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

function CategoryIcon({ category }: { category: string }) {
  const className = "size-6 shrink-0 text-ds-text-primary";
  switch (category) {
    case "human_handover":
      return <MessageCircle className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "appointment_request":
      return <CalendarDays className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "appointment_status":
      return <CalendarCheck className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "sla_breach":
      return <Clock className={className} strokeWidth={1.75} aria-hidden="true" />;
    case "assignment":
      return <Users className={className} strokeWidth={1.75} aria-hidden="true" />;
    default:
      return <UserRound className={className} strokeWidth={1.75} aria-hidden="true" />;
  }
}

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
    <form action={formAction} className="dx-card flex flex-col gap-4 dx-card-pad">
      <div className="flex flex-col gap-0.5">
        <h2 className="dx-title">Notification preferences</h2>
        <p className="dx-subtitle text-base">Set dashboard visibility and email delivery for each event.</p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col">
        {/* Column headings (decorative on small screens, where each row stacks). */}
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(0,1fr)_9rem_minmax(26rem,1.1fr)] items-center gap-6 rounded-xl bg-ds-surface-soft px-5 py-2.5 lg:grid"
        >
          <span className="text-sm font-medium text-ds-text-primary">Event</span>
          <span className="text-center text-sm font-medium text-ds-text-primary">Show in dashboard</span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ds-text-primary">Email delivery</span>
            <span className="text-sm text-ds-text-secondary">Immediately · Once a day · Dashboard only</span>
          </span>
        </div>

        <ul className="dx-rows flex flex-col">
          {preferences.map((preference) => {
            const title = CATEGORY_COPY[preference.category]?.title ?? preference.category;
            return (
              <li
                key={preference.category}
                className="grid grid-cols-1 items-center gap-x-6 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_9rem_minmax(26rem,1.1fr)]"
              >
                <div className="flex min-w-0 items-center gap-5">
                  <CategoryIcon category={preference.category} />
                  <div className="flex min-w-0 flex-col">
                    <p className="text-sm leading-snug font-medium text-ds-text-primary">{title}</p>
                    <p className="text-sm text-ds-text-secondary">{CATEGORY_COPY[preference.category]?.description}</p>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 lg:justify-center">
                  <span className="relative inline-flex">
                    <input
                      type="checkbox"
                      name={`in_app_${preference.category}`}
                      defaultChecked={preference.inAppEnabled}
                      disabled={!canEdit}
                      className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <span aria-hidden="true" className="dx-switch" />
                  </span>
                  <span className="text-sm text-ds-text-primary lg:sr-only">Show {title} in the dashboard</span>
                </label>

                <fieldset
                  className="m-0 grid min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-ds-border-strong p-0 sm:grid-cols-3"
                  disabled={!canEdit}
                >
                  <legend className="sr-only">Email for {title}</legend>
                  {EMAIL_MODES.map((mode) => {
                    // "Email me now" is pointless with nowhere to send it; the page
                    // explains why directly above this form.
                    const unavailable = mode.value === "immediate" && !hasContactEmail;
                    return (
                      <label
                        key={mode.value}
                        title={mode.hint}
                        className={`flex min-h-10 cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors has-[:checked]:bg-ds-lime-soft has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ds-primary ${
                          unavailable ? "cursor-not-allowed text-ds-text-muted" : "text-ds-text-primary"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`email_mode_${preference.category}`}
                          value={mode.value}
                          defaultChecked={preference.emailMode === mode.value}
                          disabled={!canEdit || unavailable}
                          className="size-5 shrink-0 accent-ds-accent"
                        />
                        <span>{mode.label}</span>
                        <span className="sr-only">: {mode.hint}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4">
        <p className="flex items-center gap-3 text-sm text-ds-text-secondary">
          <Lock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Only admins can change these settings.
        </p>
        {canEdit ? (
          <button type="submit" disabled={isPending} className={`${btnPrimary} min-w-64 text-base`}>
            {isPending ? "Saving…" : "Save notification settings"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export type { NotificationCategory };
