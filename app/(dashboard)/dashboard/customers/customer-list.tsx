"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "../_components/state-views";
import { DataTable, TableCell, TableRow, type DataTableColumn, type SortState } from "../_components/data-table";
import { Avatar, ChannelIcon, Pill, type PillTone } from "../_components/ui";
import { channelLabel } from "@/lib/conversation-channel";
import { MAX_LEAD_SCORE } from "@/lib/lead-scoring";
import type { LeadQualification } from "@/lib/supabase/types";
import type { CustomerSummary } from "@/lib/customers";
import { displayContactName } from "@/lib/lead-source";

const QUALIFICATION_TONE: Record<LeadQualification, PillTone> = {
  hot: "solid",
  warm: "lime",
  cold: "gray",
};

const QUALIFICATION_LABEL: Record<LeadQualification, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
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
      { key: "customer", label: "Customer", width: "minmax(15rem,1.7fr)" },
      { key: "score", label: "Score", width: "11rem" },
      { key: "channel", label: "Channel", width: "9rem" },
      { key: "activity", label: "Activity", width: "minmax(11rem,1.2fr)" },
      { key: "tags", label: "Tags", width: "minmax(11rem,1.5fr)" },
      { key: "last_activity", label: "Last activity", width: "9.5rem", sortable: true },
      { key: "open", label: "", width: "3rem", align: "right" },
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
      renderRow={(customer) => {
        return (
          <TableRow key={customer.id} href={`/dashboard/customers/${customer.id}`}>
            <TableCell className="min-w-0 gap-3.5">
              <Avatar name={customer.displayName} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-ds-text-primary">{displayContactName(customer.displayName) ?? "Unnamed prospect"}</span>
                <span className="truncate text-xs text-ds-text-secondary">{customer.email ?? customer.phone ?? "No contact info"}</span>
                {customer.email && customer.phone ? (
                  <span className="truncate text-sm text-ds-text-secondary">{customer.phone}</span>
                ) : null}
              </span>
            </TableCell>
            <TableCell>
              {customer.latestLead ? (
                <span className="inline-flex items-center rounded-full border border-ds-border bg-ds-surface">
                  <Pill tone={QUALIFICATION_TONE[customer.latestLead.qualification]} className="font-medium">
                    {QUALIFICATION_LABEL[customer.latestLead.qualification]}
                  </Pill>
                  <span className="px-3 text-sm font-medium tabular-nums text-ds-text-primary">
                    {customer.latestLead.score}/{MAX_LEAD_SCORE}
                  </span>
                </span>
              ) : (
                <Pill tone="gray" className="font-medium">
                  No lead yet
                </Pill>
              )}
            </TableCell>
            <TableCell className="gap-2.5">
              <ChannelIcon source={customer.latestChannel} website="globe" className="size-5 shrink-0" strokeWidth={1.75} />
              {channelLabel(customer.latestChannel)}
            </TableCell>
            <TableCell>
              {customer.needsAttention ? (
                <Pill tone="amber" className="font-medium">
                  Needs attention
                </Pill>
              ) : customer.humanControlled ? (
                <Pill tone="lime" className="font-medium">
                  Human-controlled
                </Pill>
              ) : (
                <Pill tone="lime">
                  {customer.conversationCount} conversation{customer.conversationCount === 1 ? "" : "s"} · {customer.appointmentCount}{" "}
                  appt{customer.appointmentCount === 1 ? "" : "s"}
                </Pill>
              )}
            </TableCell>
            <TableCell className="flex-wrap gap-1.5">
              {customer.tagNames.length === 0 ? (
                <span className="text-xs text-ds-text-muted">—</span>
              ) : (
                customer.tagNames.slice(0, 2).map((name) => (
                  <Pill key={name} tone="outline">
                    {name}
                  </Pill>
                ))
              )}
              {customer.tagNames.length > 2 ? (
                <span className="text-sm text-ds-text-secondary">+{customer.tagNames.length - 2}</span>
              ) : null}
            </TableCell>
            <TableCell>{relativeTime(customer.lastActivityAt)}</TableCell>
            <TableCell align="right">
              <ChevronRight strokeWidth={1.75} className="size-5 text-ds-text-primary" aria-hidden="true" />
            </TableCell>
          </TableRow>
        );
      }}
    />
  );
}
