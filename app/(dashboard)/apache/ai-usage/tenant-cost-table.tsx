"use client";

import { useMemo, useState } from "react";
import { DataTable, TableRow, TableCell, type SortState } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import { USD_TO_INR_RATE } from "@/lib/gemini-pricing";
import { formatPaiseAsInr2dp } from "@/lib/invoice-format";
import type { TenantCostMargin } from "@/lib/admin-ai-usage";

const COLUMNS = [
  { key: "businessName", label: "Tenant", sortable: true, width: "2fr" },
  { key: "planName", label: "Plan", sortable: true },
  { key: "costUsd", label: "Gemini cost", sortable: true, align: "right" as const },
  { key: "revenuePaise", label: "Revenue", sortable: true, align: "right" as const },
  { key: "costPercentOfRevenue", label: "Cost / revenue", sortable: true, align: "right" as const },
];

export function TenantCostTable({ tenants }: { tenants: TenantCostMargin[] }) {
  const [sort, setSort] = useState<SortState>({ key: "costUsd", direction: "desc" });

  const sorted = useMemo(() => {
    if (!sort) return tenants;
    const rows = [...tenants].sort((a, b) => {
      const av = a[sort.key as keyof TenantCostMargin];
      const bv = b[sort.key as keyof TenantCostMargin];
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av ?? "").localeCompare(String(bv ?? ""));
    });
    return sort.direction === "asc" ? rows : rows.reverse();
  }, [tenants, sort]);

  return (
    <DataTable
      items={sorted}
      columns={COLUMNS}
      getRowId={(t) => t.businessId}
      sort={sort}
      onSortChange={setSort}
      caption="AI cost by tenant"
      emptyState="No Gemini usage recorded for any tenant in this period."
      renderRow={(t) => (
        <TableRow href={`/apache/tenants/${t.businessId}`}>
          <TableCell>
            <span className="flex items-center gap-2">
              {t.businessName}
              {t.flagged ? <Badge tone="danger">High cost</Badge> : null}
            </span>
          </TableCell>
          <TableCell>{t.planName}</TableCell>
          <TableCell align="right">
            ${t.costUsd.toFixed(3)} <span className="text-ds-text-muted">(≈ {formatPaiseAsInr2dp(Math.round(t.costUsd * USD_TO_INR_RATE * 100))})</span>
          </TableCell>
          <TableCell align="right">{formatPaiseAsInr2dp(t.revenuePaise)}</TableCell>
          <TableCell align="right">{t.costPercentOfRevenue === null ? "—" : `${t.costPercentOfRevenue.toFixed(1)}%`}</TableCell>
        </TableRow>
      )}
    />
  );
}
