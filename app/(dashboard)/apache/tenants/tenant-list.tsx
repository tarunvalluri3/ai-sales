"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { DataTable, TableRow, TableCell, type SortState } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import type { TenantListRow } from "@/lib/admin-tenants";
import { PLAN_KEYS, type PlanKey } from "@/lib/plans";
import type { Business } from "@/lib/supabase/types";
import { exportTenantsCsvAction } from "./actions";

const COLUMNS = [
  { key: "name", label: "Tenant", sortable: true, width: "2fr" },
  { key: "planName", label: "Plan", sortable: true },
  { key: "subscriptionStatus", label: "Subscription", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "createdAt", label: "Signed up", sortable: true },
];

function sortTenants(tenants: TenantListRow[], sort: SortState): TenantListRow[] {
  if (!sort) return tenants;
  const { key, direction } = sort;
  const sorted = [...tenants].sort((a, b) => {
    const av = String(a[key as keyof TenantListRow] ?? "");
    const bv = String(b[key as keyof TenantListRow] ?? "");
    return av.localeCompare(bv);
  });
  return direction === "asc" ? sorted : sorted.reverse();
}

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function TenantList({ tenants }: { tenants: TenantListRow[] }) {
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });
  const [isExporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const sortedTenants = useMemo(() => sortTenants(tenants, sort), [tenants, sort]);

  function handleExport() {
    setExportError(null);
    startExport(async () => {
      const planParam = searchParams.get("plan");
      const statusParam = searchParams.get("status");
      const result = await exportTenantsCsvAction({
        search: searchParams.get("q") ?? undefined,
        planKey: planParam && PLAN_KEYS.includes(planParam as PlanKey) ? (planParam as PlanKey) : undefined,
        status: statusParam === "active" || statusParam === "suspended" ? (statusParam as Business["status"]) : undefined,
      });
      if (result.error || !result.csv) {
        setExportError(result.error ?? "Something went wrong preparing the export.");
        return;
      }
      downloadCsv(result.csv);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-ds-sm border border-ds-border px-3 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isExporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>
      {exportError ? <p className="text-right text-2xs text-ds-danger">{exportError}</p> : null}

      <DataTable
        items={sortedTenants}
        columns={COLUMNS}
        getRowId={(tenant) => tenant.id}
        sort={sort}
        onSortChange={setSort}
        caption="Tenants"
        emptyState="No tenants match these filters."
        renderRow={(tenant) => (
          <TableRow href={`/apache/tenants/${tenant.id}`}>
            <TableCell direction="col">
              <span className="font-medium text-ds-text-primary">{tenant.name}</span>
              <span className="text-xs text-ds-text-muted">{tenant.contactEmail ?? "No contact email"}</span>
            </TableCell>
            <TableCell>{tenant.planName ?? "Grandfathered (Scale)"}</TableCell>
            <TableCell>
              {tenant.subscriptionStatus ? (
                <Badge tone={subscriptionTone(tenant.subscriptionStatus)}>{tenant.subscriptionStatus}</Badge>
              ) : (
                <span className="text-ds-text-muted">—</span>
              )}
            </TableCell>
            <TableCell>
              <Badge tone={tenant.status === "active" ? "success" : "danger"}>{tenant.status}</Badge>
            </TableCell>
            <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}

function subscriptionTone(status: string): "success" | "warning" | "danger" | "accent" {
  if (status === "active") return "success";
  if (status === "trialing") return "accent";
  if (status === "past_due") return "warning";
  return "danger";
}
