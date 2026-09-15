import Link from "next/link";
import { PRIORITY_REASON_KEY_LABELS } from "@/lib/copilot-lifecycle";
import type { CompletedActionItem } from "@/lib/copilot-actions";
import { Badge } from "../_components/badge";
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
    return <EmptyState title="Nothing completed yet" description="Actions you complete or mark as handled will show up here." />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const at = item.completedAt ?? item.dismissedAt;
        const by = item.completedBy ?? item.dismissedBy;
        return (
          <li key={item.id} className="flex flex-col gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/dashboard/customers/${item.customerId}`} className="text-sm font-medium text-ds-text-primary hover:underline">
                {item.customerName ?? "Unnamed prospect"}
              </Link>
              <span className="text-xs text-ds-text-muted">{at ? timeAgo(at) : ""}</span>
            </div>
            <p className="text-sm text-ds-text-secondary">{item.title}</p>
            <p className="text-xs text-ds-text-muted">{by ? `By ${by}` : "Automatically completed"}</p>
            <div className="flex flex-wrap gap-1">
              {item.reasonKeys.map((key) => (
                <Badge key={key} tone="muted" size="sm">
                  {PRIORITY_REASON_KEY_LABELS[key]}
                </Badge>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
