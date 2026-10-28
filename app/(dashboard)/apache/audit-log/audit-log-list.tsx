"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AdminAuditLogEntry, AdminAuditLogMetadata } from "@/lib/supabase/types";

export function AuditLogList({ entries }: { entries: AdminAuditLogEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (entries.length === 0) {
    return <p className="rounded-ds-lg border border-dashed border-ds-border py-10 text-center text-sm text-ds-text-secondary">No audit entries match this filter.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const hasDiff = Boolean(entry.before) || Boolean(entry.after);
        return (
          <li key={entry.id} className="rounded-ds-lg border border-ds-border bg-ds-surface">
            <button
              type="button"
              onClick={() => hasDiff && toggle(entry.id)}
              disabled={!hasDiff}
              className="flex w-full items-start gap-3 p-3 text-left disabled:cursor-default"
            >
              {hasDiff ? (
                expanded.has(entry.id) ? (
                  <ChevronDown className="mt-0.5 size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                )
              ) : (
                <span className="mt-0.5 size-4 shrink-0" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-ds-text-primary">{entry.action}</span>
                  <span className="text-xs text-ds-text-muted">
                    {entry.target_type} · {entry.target_id}
                  </span>
                </div>
                <span className="text-xs text-ds-text-muted">
                  {entry.actor_user_id} · {new Date(entry.created_at).toLocaleString()}
                  {entry.business_id ? ` · tenant ${entry.business_id}` : ""}
                </span>
              </div>
            </button>
            {hasDiff && expanded.has(entry.id) ? (
              <div className="border-t border-ds-border p-3">
                <DiffView before={entry.before} after={entry.after} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DiffView({ before, after }: { before: AdminAuditLogMetadata | null; after: AdminAuditLogMetadata | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();

  if (keys.length === 0) {
    return <p className="text-xs text-ds-text-muted">No before/after metadata recorded for this entry.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead className="text-left text-ds-text-muted">
        <tr>
          <th className="py-1 pr-3">Field</th>
          <th className="py-1 pr-3">Before</th>
          <th className="py-1">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const beforeValue = before?.[key] ?? null;
          const afterValue = after?.[key] ?? null;
          const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
          return (
            <tr key={key} className="border-t border-ds-border">
              <td className="py-1 pr-3 font-mono text-ds-text-secondary">{key}</td>
              <td className={`py-1 pr-3 font-mono ${changed ? "text-ds-danger" : "text-ds-text-muted"}`}>{formatValue(beforeValue)}</td>
              <td className={`py-1 font-mono ${changed ? "text-ds-success" : "text-ds-text-muted"}`}>{formatValue(afterValue)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null) return "—";
  return String(value);
}
