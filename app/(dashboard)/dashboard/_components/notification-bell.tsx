"use client";

import { useBusinessTime } from "./business-time";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useFocusTrap } from "./use-focus-trap";
import { useUnreadNotificationCount } from "./attention-provider";
import { formatAttentionBadge } from "./nav-items";
import { InlineEmptyState, ErrorState } from "./state-views";
import { listNotificationsAction, markAllNotificationsReadAction, markNotificationReadFromBellAction } from "../actions";
import type { InternalNotification, NotificationCategory } from "@/lib/supabase/types";

/**
 * The dashboard's notification surface (2026-10-21).
 *
 * Before this, a business had no way to learn that a widget conversation had
 * escalated to a human or that an appointment was waiting for approval --
 * `internal_notifications` existed but was only ever rendered, statically, on
 * the Workflows page.
 *
 * Two deliberate splits:
 * - **The unread COUNT is live, the LIST is not.** The count rides the existing
 *   1-second dashboard poll in attention-provider.tsx; the 50-row list is
 *   fetched once each time this dropdown opens. Polling the list every second
 *   is exactly the aggressive polling this project avoids.
 * - **role="dialog", not role="menu".** This is a scrollable list of links with
 *   a footer action, not a command menu; `role="menu"` would promise arrow-key
 *   item navigation that is not implemented. The focus trap gives it the
 *   dialog behaviour a screen-reader user expects.
 */

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  human_handover: "Needs a human",
  appointment_request: "Appointment",
  appointment_status: "Appointment",
  lead_created: "New lead",
  sla_breach: "Missed SLA",
  assignment: "Assigned",
  workflow: "Workflow",
};

/** Short relative time, built locally rather than adding a date dependency. */
function formatRelativeTime(iso: string, formatOlder: (iso: string) => string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatOlder(iso);
}

export function NotificationBell() {
  const businessTime = useBusinessTime();
  const unreadCount = useUnreadNotificationCount();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InternalNotification[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useFocusTrap(isOpen);
  const panelId = useId();

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setNotifications(await listNotificationsAction());
    } catch {
      setLoadFailed(true);
    }
  }, []);

  // Fetched from the open handler rather than an effect: opening is a user
  // action, not state to synchronise against, and loading in an effect trips
  // react-hooks/set-state-in-effect. Refetched on every open rather than
  // cached, since the badge may have moved since last time.
  function toggleOpen() {
    setIsOpen((previous) => {
      if (!previous) void load();
      return !previous;
    });
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  // Marking read never blocks navigation: the row stays a real link and this
  // fires alongside it. A failure just leaves the row unread, which the next
  // open reveals. The badge is corrected by the next poll tick rather than
  // optimistically here, so there is only ever one source of truth for it.
  function handleRowClick(notification: InternalNotification) {
    if (notification.read_at) return;
    setNotifications((current) =>
      current ? current.map((item) => (item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)) : current,
    );
    startTransition(() => {
      void markNotificationReadFromBellAction(notification.id);
    });
  }

  function handleMarkAll() {
    const now = new Date().toISOString();
    setNotifications((current) => (current ? current.map((item) => ({ ...item, read_at: item.read_at ?? now })) : current));
    startTransition(() => {
      void markAllNotificationsReadAction();
    });
  }

  const hasUnread = unreadCount > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        onClick={toggleOpen}
        className="relative flex size-11 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden="true" />
        {hasUnread ? (
          // aria-hidden: the count is already in the trigger's aria-label, so
          // announcing it here would read it twice.
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-ds-attention px-1 text-2xs leading-5 font-medium text-ds-on-bright"
          >
            {formatAttentionBadge(unreadCount)}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute top-13 right-0 z-30 flex max-h-96 w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-ds-border bg-ds-surface-elevated"
        >
          <div className="flex items-center justify-between border-b border-ds-border px-4 py-3">
            <p className="text-sm font-medium text-ds-text-primary">Notifications</p>
            {hasUnread ? (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:opacity-60"
              >
                <Check strokeWidth={1.75} className="size-3" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadFailed ? (
              <div className="p-3">
                <ErrorState title="Couldn't load notifications" onRetry={() => void load()} />
              </div>
            ) : notifications === null ? (
              <p className="px-3 py-6 text-center text-sm text-ds-text-muted">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-6">
                <InlineEmptyState icon={Bell} label="Nothing yet — new leads, handovers and appointment requests show up here." />
              </div>
            ) : (
              <ul className="divide-y divide-ds-border">
                {notifications.map((notification) => {
                  const isUnread = !notification.read_at;
                  const body = (
                    <div className="flex items-start gap-2">
                      {isUnread ? <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ds-primary" /> : <span className="mt-1.5 size-1.5 shrink-0" />}
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-medium text-ds-text-muted">
                          {CATEGORY_LABELS[notification.category]}
                        </span>
                        <span className={isUnread ? "text-sm font-medium text-ds-text-primary" : "text-sm text-ds-text-muted"}>
                          {notification.message}
                        </span>
                        <span className="text-2xs text-ds-text-muted">{formatRelativeTime(notification.created_at, businessTime.date)}</span>
                      </div>
                    </div>
                  );

                  return (
                    <li key={notification.id}>
                      {notification.link ? (
                        <Link
                          href={notification.link}
                          onClick={() => handleRowClick(notification)}
                          className="block rounded-none px-4 py-3 transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-primary"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setIsOpen(false)}
            className="rounded-none border-t border-ds-border px-4 py-3 text-center text-xs font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ds-primary"
          >
            Notification settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
