import Link from "next/link";
import { SnoozeMenu } from "./snooze-menu";
import { MarkAsHandledButton } from "./mark-handled-button";
import { PRIORITY_REASON_KEY_LABELS } from "@/lib/copilot-lifecycle";
import type { UpcomingActionItem } from "@/lib/copilot-actions";
import { Badge } from "../_components/badge";
import { EmptyState } from "../_components/state-views";

function formatSnoozedUntil(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Snoozed Copilot actions, soonest wake time first -- "remind me at this
 * time" items a staff member deliberately deferred, distinct from
 * anything dismissed/completed. Wakes on its own once `snoozedUntil`
 * passes (lib/copilot-lifecycle.ts's `isSnoozeDue`, applied on the next
 * Today reconciliation) -- no action required here to bring it back.
 */
export function UpcomingList({ items, canManage, timezone }: { items: UpcomingActionItem[]; canManage: boolean; timezone: string }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing snoozed" description="Items you snooze from Today will wait here until their reminder time." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col">
              <Link href={`/dashboard/customers/${item.customerId}`} className="text-sm font-semibold text-ds-text-primary hover:underline">
                {item.customerName ?? "Unnamed prospect"}
              </Link>
              <span className="text-sm text-ds-text-secondary">{item.title}</span>
            </div>
            <span className="text-xs font-medium text-ds-text-muted">{formatSnoozedUntil(item.snoozedUntil, timezone)}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {item.reasonKeys.map((key) => (
              <Badge key={key} tone="muted" size="sm">
                {PRIORITY_REASON_KEY_LABELS[key]}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/customers/${item.customerId}`}
              className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong"
            >
              Open conversation
            </Link>
            <MarkAsHandledButton customerId={item.customerId} reasonKeys={item.reasonKeys} canManage={canManage} />
            <SnoozeMenu customerId={item.customerId} actionType={item.actionType} canSnooze={canManage} label="Snooze again" />
          </div>
        </li>
      ))}
    </ul>
  );
}
