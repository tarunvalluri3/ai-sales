import Link from "next/link";
import { DeleteButton } from "../_components/delete-button";
import { Badge } from "../_components/badge";
import { undismissPriorityItemAction } from "./actions";
import { PRIORITY_REASON_KEY_LABELS, type RecentlyHandledItem } from "@/lib/copilot";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Collapsed history of Copilot items marked handled. Each row's Undo
 * reuses the shared `DeleteButton` component verbatim -- its `(id,
 * action)` contract matches exactly, since `id` here is the customer id,
 * which uniquely identifies the dismissal row (`unique (business_id,
 * customer_id)`).
 */
export function RecentlyHandledSection({
  items,
  canDismiss,
}: {
  items: RecentlyHandledItem[];
  canDismiss: boolean;
}) {
  return (
    <details className="rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ds-text-primary">
        Recently handled ({items.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.customerId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-ds-sm border border-ds-border bg-ds-surface-soft p-3"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/customers/${item.customerId}`}
                  className="text-sm font-medium text-ds-text-primary hover:underline"
                >
                  {item.customerName ?? "Unnamed prospect"}
                </Link>
                <span className="text-xs text-ds-text-muted">
                  Handled by {item.dismissedBy} · {timeAgo(item.dismissedAt)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {item.reasonKeys.map((key) => (
                  <Badge key={key} tone="muted" size="sm">
                    {PRIORITY_REASON_KEY_LABELS[key]}
                  </Badge>
                ))}
              </div>
            </div>
            <DeleteButton action={undismissPriorityItemAction} id={item.customerId} label="Undo" canEdit={canDismiss} />
          </li>
        ))}
      </ul>
    </details>
  );
}
