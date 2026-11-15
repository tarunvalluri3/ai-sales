import Link from "next/link";
import { SnoozeMenu } from "./snooze-menu";
import { MarkAsHandledButton } from "./mark-handled-button";
import { PRIORITY_REASON_KEY_LABELS } from "@/lib/copilot-lifecycle";
import type { UpcomingActionItem } from "@/lib/copilot-actions";
import { Clock, MessageCircle } from "lucide-react";
import { Pill, btnOutlineSm } from "../_components/ui";
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
        <li key={item.id} className="dx-card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col">
              <Link
                href={`/dashboard/customers/${item.customerId}`}
                className="w-fit rounded-md text-sm font-medium text-ds-primary underline underline-offset-4"
              >
                {item.customerName ?? "Unnamed prospect"}
              </Link>
              <span className="text-sm font-medium text-ds-text-primary">{item.title}</span>
            </div>
            <span className="flex items-center gap-2 text-sm font-medium text-ds-text-primary">
              <Clock className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {formatSnoozedUntil(item.snoozedUntil, timezone)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.reasonKeys.map((key) => (
              <Pill key={key} tone="gray" size="sm">
                {PRIORITY_REASON_KEY_LABELS[key]}
              </Pill>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/dashboard/customers/${item.customerId}`}
              className={`${btnOutlineSm} h-10`}
            >
              <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden="true" />
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
