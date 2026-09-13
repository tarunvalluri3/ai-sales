"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { Badge, type BadgeTone } from "../_components/badge";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { LeadQualification } from "@/lib/supabase/types";
import type { CustomerSummary } from "@/lib/customers";

const QUALIFICATION_TONE: Record<LeadQualification, BadgeTone> = {
  hot: "accent",
  warm: "success",
  cold: "muted",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CustomerList({ customers }: { customers: CustomerSummary[] }) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedCustomers = useMemo(() => {
    const base = [...customers].sort((a, b) => {
      const scoreDiff = (b.latestLead?.score ?? -1) - (a.latestLead?.score ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
      return a.lastActivityAt > b.lastActivityAt ? -1 : 1;
    });
    if (!sort) return base;
    const direction = sort.direction === "asc" ? 1 : -1;
    return base.sort((a, b) => direction * (a.lastActivityAt > b.lastActivityAt ? 1 : a.lastActivityAt < b.lastActivityAt ? -1 : 0));
  }, [customers, sort]);

  const columns = useMemo<DataTableColumn[]>(
    () => [
      { key: "customer", label: "Customer", width: "1.6fr" },
      { key: "score", label: "Score", width: "150px" },
      { key: "channel", label: "Channel", width: "120px" },
      { key: "activity", label: "Activity", width: "160px" },
      { key: "tags", label: "Tags", width: "1.2fr" },
      { key: "last_activity", label: "Last activity", width: "120px", sortable: true },
    ],
    [],
  );

  if (customers.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        description="Customer profiles appear automatically once a prospect leaves contact info through a lead or an appointment booking, on any channel."
      />
    );
  }

  return (
    <DataTable
      items={sortedCustomers}
      columns={columns}
      getRowId={(customer) => customer.id}
      sort={sort}
      onSortChange={setSort}
      caption="Customers"
      renderRow={(customer) => (
        <TableRow key={customer.id} href={`/dashboard/customers/${customer.id}`}>
          <TableCell direction="col">
            <span className="font-medium text-ds-text-primary">{customer.displayName ?? "Unnamed prospect"}</span>
            <span className="text-xs text-ds-text-muted">{customer.email ?? customer.phone ?? "No contact info"}</span>
          </TableCell>
          <TableCell direction="col">
            {customer.latestLead ? (
              <>
                <Badge tone={QUALIFICATION_TONE[customer.latestLead.qualification]} size="sm">
                  {customer.latestLead.qualification}
                </Badge>
                <span className="text-2xs text-ds-text-muted">
                  {customer.latestLead.score}/{MAX_LEAD_SCORE}
                </span>
              </>
            ) : (
              <span className="text-xs text-ds-text-muted">No lead yet</span>
            )}
          </TableCell>
          <TableCell>{channelLabel(customer.latestChannel)}</TableCell>
          <TableCell direction="col">
            {customer.needsAttention ? (
              <Badge tone="warning" size="sm">
                Needs attention
              </Badge>
            ) : customer.humanControlled ? (
              <Badge tone="muted" size="sm">
                Human-controlled
              </Badge>
            ) : (
              <span className="text-xs text-ds-text-muted">
                {customer.conversationCount} conversation{customer.conversationCount === 1 ? "" : "s"}
                {customer.appointmentCount > 0 ? `, ${customer.appointmentCount} appt${customer.appointmentCount === 1 ? "" : "s"}` : ""}
              </span>
            )}
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {customer.tagNames.length === 0 ? (
                <span className="text-xs text-ds-text-muted">—</span>
              ) : (
                customer.tagNames.slice(0, 3).map((name) => (
                  <Badge key={name} tone="muted" size="sm">
                    {name}
                  </Badge>
                ))
              )}
              {customer.tagNames.length > 3 ? (
                <span className="text-2xs text-ds-text-muted">+{customer.tagNames.length - 3}</span>
              ) : null}
            </div>
          </TableCell>
          <TableCell>{relativeTime(customer.lastActivityAt)}</TableCell>
        </TableRow>
      )}
    />
  );
}
