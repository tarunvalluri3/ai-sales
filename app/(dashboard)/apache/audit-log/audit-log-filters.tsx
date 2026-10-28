"use client";

import { useMemo } from "react";
import type { AdminAuditLogEntry } from "@/lib/supabase/types";

/** GET form, same pattern as app/(dashboard)/apache/tenants/tenant-filters.tsx. `recentEntries` is an unfiltered sample used only to populate the action/target-type dropdown options -- see audit-log/page.tsx's own comment for why it's a separate read from the filtered list below it. */
export function AuditLogFilters({
  initial,
  recentEntries,
}: {
  initial: { q?: string; action?: string; targetType?: string };
  recentEntries: AdminAuditLogEntry[];
}) {
  const actions = useMemo(() => [...new Set(recentEntries.map((e) => e.action))].sort(), [recentEntries]);
  const targetTypes = useMemo(() => [...new Set(recentEntries.map((e) => e.target_type))].sort(), [recentEntries]);

  return (
    <form action="/apache/audit-log" method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={initial.q ?? ""}
          placeholder="Target ID or tenant ID"
          className="w-56 rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Action</span>
        <select
          name="action"
          defaultValue={initial.action ?? ""}
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-ds-text-secondary">Target type</span>
        <select
          name="targetType"
          defaultValue={initial.targetType ?? ""}
          className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <option value="">All target types</option>
          {targetTypes.map((targetType) => (
            <option key={targetType} value={targetType}>
              {targetType}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        Filter
      </button>
    </form>
  );
}
