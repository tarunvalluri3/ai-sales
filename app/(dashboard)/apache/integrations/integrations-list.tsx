"use client";

import { useMemo, useState, useTransition } from "react";
import { DataTable, TableRow, TableCell } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { notifyTenantOfBrokenIntegration } from "@/lib/admin-integration-actions";
import type { IntegrationRow } from "@/lib/admin-integrations";

/** Mirrors lib/admin-integrations.ts's isBroken() -- not imported directly, since that module is server-only and this is a client component. */
function isBroken(row: IntegrationRow): boolean {
  return row.status === "error" || row.status === "disconnected";
}

const COLUMNS = [
  { key: "select", label: "" },
  { key: "businessName", label: "Tenant", width: "2fr" },
  { key: "channel", label: "Channel" },
  { key: "status", label: "Status" },
  { key: "lastVerifiedAt", label: "Last verified" },
  { key: "lastError", label: "Last error", width: "2fr" },
];

function rowKey(r: IntegrationRow): string {
  return `${r.businessId}-${r.channel}`;
}

export function IntegrationsList({ integrations }: { integrations: IntegrationRow[] }) {
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isNotifying, startNotify] = useTransition();
  const [results, setResults] = useState<Record<string, string>>({});

  const filtered = useMemo(() => (brokenOnly ? integrations.filter(isBroken) : integrations), [integrations, brokenOnly]);
  const brokenRows = useMemo(() => integrations.filter(isBroken), [integrations]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleNotifySelected() {
    setResults({});
    startNotify(async () => {
      const rows = integrations.filter((r) => selected.has(rowKey(r)));
      const outcomes: Record<string, string> = {};
      for (const row of rows) {
        const result = await notifyTenantOfBrokenIntegration({
          businessId: row.businessId,
          contactEmail: row.contactEmail,
          businessName: row.businessName,
          channel: row.channel,
        });
        outcomes[rowKey(row)] = result.ok ? "Notified" : result.error;
      }
      setResults(outcomes);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ds-text-secondary">
          <input type="checkbox" checked={brokenOnly} onChange={(e) => setBrokenOnly(e.target.checked)} />
          Broken only ({brokenRows.length})
        </label>
        <button
          type="button"
          onClick={handleNotifySelected}
          disabled={isNotifying || selected.size === 0}
          className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover disabled:opacity-40"
        >
          {isNotifying ? "Notifying…" : `Notify selected (${selected.size})`}
        </button>
      </div>

      <DataTable
        items={filtered}
        columns={COLUMNS}
        getRowId={rowKey}
        caption="Integrations"
        emptyState="No integrations match this filter."
        renderRow={(row) => {
          const key = rowKey(row);
          return (
            <TableRow>
              <TableCell>
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} aria-label={`Select ${row.businessName} ${row.channel}`} />
              </TableCell>
              <TableCell>{row.businessName}</TableCell>
              <TableCell>{row.channel === "whatsapp" ? "WhatsApp" : "Instagram"}</TableCell>
              <TableCell>
                <Badge tone={row.status === "connected" ? "success" : row.status === "error" ? "danger" : "muted"}>{row.status}</Badge>
              </TableCell>
              <TableCell>{row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString() : "Never"}</TableCell>
              <TableCell direction="col">
                {row.lastError ? <span className="truncate text-xs text-ds-danger">{row.lastError}</span> : null}
                {results[key] ? <span className="text-xs text-ds-text-muted">{results[key]}</span> : null}
              </TableCell>
            </TableRow>
          );
        }}
      />
    </div>
  );
}
