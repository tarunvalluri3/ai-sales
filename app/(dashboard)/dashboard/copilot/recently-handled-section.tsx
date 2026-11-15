import Link from "next/link";
import { DeleteButton } from "../_components/delete-button";
import { Pill } from "../_components/ui";
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
    <details className="dx-card px-5 py-4">
      <summary className="cursor-pointer rounded-lg text-sm font-medium text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary">
        Recently handled ({items.length})
      </summary>
      <ul className="dx-rows mt-2 flex flex-col">
        {items.map((item) => (
          <li
            key={item.customerId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="flex flex-col gap-1">
              <Link
                href={`/dashboard/customers/${item.customerId}`}
                className="w-fit rounded-md text-sm font-medium text-ds-text-primary hover:underline"
              >
                {item.customerName ?? "Unnamed prospect"}
              </Link>
              <span className="text-sm text-ds-text-secondary">
                By {item.dismissedBy} · {timeAgo(item.dismissedAt)}
              </span>
              <div className="flex flex-wrap gap-2">
                {item.reasonKeys.map((key) => (
                  <Pill key={key} tone="gray" size="sm">
                    {PRIORITY_REASON_KEY_LABELS[key]}
                  </Pill>
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
