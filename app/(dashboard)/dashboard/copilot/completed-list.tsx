import Link from "next/link";
import { PRIORITY_REASON_KEY_LABELS } from "@/lib/copilot-lifecycle";
import type { CompletedActionItem } from "@/lib/copilot-actions";
import { Pill } from "../_components/ui";
import { EmptyState } from "../_components/state-views";

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
 * Focused Copilot work history -- completed and dismissed actions only
 * (never superseded/expired, which are background bookkeeping, not "work
 * that got done"). "By <user>" for a manual dismissal or a staff action
 * that triggered auto-completion (an appointment confirm, a reply sent);
 * "Automatically completed" when `completedBy`/`dismissedBy` is null.
 * Deliberately not an enormous CRM history page -- see
 * `listCompletedCopilotActions()`'s own bounded `limit`.
 */
export function CompletedList({ items }: { items: CompletedActionItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing completed yet" description="Actions you complete or mark as handled will appear here." />;
  }

  return (
    <ul className="dx-card dx-rows flex flex-col px-5 py-2">
      {items.map((item) => {
        const at = item.completedAt ?? item.dismissedAt;
        const by = item.completedBy ?? item.dismissedBy;
        return (
          <li key={item.id} className="flex flex-col gap-2 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col">
                <Link href={`/dashboard/customers/${item.customerId}`} className="w-fit rounded-md text-sm font-medium text-ds-text-primary hover:underline">
                  {item.customerName ?? "Unnamed prospect"}
                </Link>
                <span className="text-xs text-ds-text-secondary">{item.title}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-ds-text-primary">{at ? timeAgo(at) : ""}</span>
                <span className="text-sm text-ds-text-secondary">{by ? `By ${by}` : "Automatic"}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.reasonKeys.map((key) => (
                <Pill key={key} tone="gray" size="sm">
                  {PRIORITY_REASON_KEY_LABELS[key]}
                </Pill>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
