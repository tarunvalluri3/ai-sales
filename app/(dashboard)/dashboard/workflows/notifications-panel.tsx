"use client";

import { useActionState } from "react";
import Link from "next/link";
import { markNotificationReadAction, type ActionState } from "./actions";
import { Bell, MessageCircle } from "lucide-react";
import { Card } from "../_components/ui";
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
      <span className={`text-sm leading-snug ${unread ? "font-medium text-ds-text-primary" : "text-ds-text-muted"}`}>{notification.message}</span>
      <span className="text-sm text-ds-text-secondary">{formatDate(notification.created_at)}</span>
    </>
  );

  return (
    <div className="flex items-start gap-3 py-2.5">
      <MessageCircle className="mt-0.5 size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        {notification.link ? (
          <Link href={notification.link} className="flex flex-col rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary">
            {content}
          </Link>
        ) : (
          <div className="flex flex-col">{content}</div>
        )}
      </div>
      {unread ? (
        <form action={formAction}>
          <input type="hidden" name="id" value={notification.id} />
          <button type="submit" disabled={isPending} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60">
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
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="dx-title flex items-center gap-3">
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Notifications
      </h2>
      {notifications.length === 0 ? (
        <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
          No notifications. A workflow&rsquo;s in-app notification step will show up here.
        </p>
      ) : (
        <div className="dx-rows flex flex-col">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </Card>
  );
}
