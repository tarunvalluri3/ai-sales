"use client";

import { useActionState } from "react";
import Link from "next/link";
import { markNotificationReadAction, type ActionState } from "./actions";
import { EmptyState } from "../_components/state-views";
import type { InternalNotification } from "@/lib/supabase/types";

const initialState: ActionState = {};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function NotificationRow({ notification }: { notification: InternalNotification }) {
  const [state, formAction, isPending] = useActionState(markNotificationReadAction, initialState);
  const unread = !notification.read_at;

  const content = (
    <>
      <span className={`text-sm ${unread ? "font-medium text-ds-text-primary" : "text-ds-text-muted"}`}>{notification.message}</span>
      <span className="text-2xs text-ds-text-muted">{formatDate(notification.created_at)}</span>
    </>
  );

  return (
    <div className="flex items-center justify-between gap-2 rounded-ds-sm px-2 py-1.5 hover:bg-ds-surface-soft">
      <div className="flex flex-1 flex-col">
        {notification.link ? (
          <Link href={notification.link} className="flex flex-col hover:underline">
            {content}
          </Link>
        ) : (
          <div className="flex flex-col">{content}</div>
        )}
      </div>
      {unread ? (
        <form action={formAction}>
          <input type="hidden" name="id" value={notification.id} />
          <button type="submit" disabled={isPending} className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60">
            Mark read
          </button>
          {state.error ? (
            <span role="alert" className="sr-only">
              {state.error}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export function NotificationsPanel({ notifications }: { notifications: InternalNotification[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <h2 className="text-sm font-semibold text-ds-text-primary">Notifications</h2>
      {notifications.length === 0 ? (
        <EmptyState title="No notifications" description="A workflow's internal-notification step will show up here." />
      ) : (
        <div className="flex flex-col gap-1">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </section>
  );
}
