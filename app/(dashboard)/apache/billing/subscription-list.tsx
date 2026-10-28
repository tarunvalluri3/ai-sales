"use client";

import { useMemo, useState } from "react";
import { DataTable, TableRow, TableCell, type SortState } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import type { SubscriptionRow } from "@/lib/admin-billing";

const COLUMNS = [
  { key: "businessName", label: "Tenant", sortable: true, width: "2fr" },
  { key: "planName", label: "Plan", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "currentPeriodEnd", label: "Renews / ends", sortable: true },
];

function tone(status: string): "success" | "warning" | "danger" | "accent" {
  if (status === "active") return "success";
  if (status === "trialing") return "accent";
  if (status === "past_due") return "warning";
  return "danger";
}

export function SubscriptionList({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const [sort, setSort] = useState<SortState>({ key: "currentPeriodEnd", direction: "asc" });

  const sorted = useMemo(() => {
    if (!sort) return subscriptions;
    const rows = [...subscriptions].sort((a, b) => {
      const av = String(a[sort.key as keyof SubscriptionRow] ?? "");
      const bv = String(b[sort.key as keyof SubscriptionRow] ?? "");
      return av.localeCompare(bv);
    });
    return sort.direction === "asc" ? rows : rows.reverse();
  }, [subscriptions, sort]);

  return (
    <DataTable
      items={sorted}
      columns={COLUMNS}
      getRowId={(s) => s.businessId}
      sort={sort}
      onSortChange={setSort}
      caption="Subscriptions"
      emptyState="No subscriptions yet."
      renderRow={(s) => (
        <TableRow href={`/apache/tenants/${s.businessId}`}>
          <TableCell>{s.businessName}</TableCell>
          <TableCell>{s.planName}</TableCell>
          <TableCell>
            <Badge tone={tone(s.status)}>{s.cancelAtPeriodEnd ? `${s.status} (cancelling)` : s.status}</Badge>
          </TableCell>
          <TableCell>
            {s.status === "trialing"
              ? s.trialEndsAt
                ? new Date(s.trialEndsAt).toLocaleDateString()
                : "—"
              : s.currentPeriodEnd
                ? new Date(s.currentPeriodEnd).toLocaleDateString()
                : "—"}
          </TableCell>
        </TableRow>
      )}
    />
  );
}
