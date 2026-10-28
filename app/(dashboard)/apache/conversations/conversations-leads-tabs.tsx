"use client";

import { useState } from "react";
import { DataTable, TableRow, TableCell } from "@/app/(dashboard)/dashboard/_components/data-table";
import { Badge } from "@/app/(dashboard)/dashboard/_components/badge";
import type { ConversationListRow, LeadListRow } from "@/lib/admin-conversations";
import { RevealButton } from "./reveal-button";

const CONVERSATION_COLUMNS = [
  { key: "businessName", label: "Tenant", width: "2fr" },
  { key: "source", label: "Channel" },
  { key: "control", label: "Control" },
  { key: "needsAttention", label: "Attention" },
  { key: "maskedContact", label: "Contact" },
  { key: "createdAt", label: "Started" },
];

const LEAD_COLUMNS = [
  { key: "businessName", label: "Tenant", width: "2fr" },
  { key: "status", label: "Status" },
  { key: "qualification", label: "Qualification" },
  { key: "contact", label: "Contact" },
  { key: "createdAt", label: "Created" },
];

export function ConversationsLeadsTabs({
  conversations,
  leads,
  initialQuery,
}: {
  conversations: ConversationListRow[];
  leads: LeadListRow[];
  initialQuery: string;
}) {
  const [tab, setTab] = useState<"conversations" | "leads">("conversations");

  return (
    <div className="flex flex-col gap-4">
      <form action="/apache/conversations" method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-ds-text-secondary">Search by tenant</span>
          <input
            type="search"
            name="q"
            defaultValue={initialQuery}
            className="w-56 rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text-primary focus:outline-none"
          />
        </label>
        <button type="submit" className="rounded-ds-sm bg-dashboard-primary px-4 py-1.5 text-sm font-medium text-dashboard-on-primary">
          Search
        </button>
      </form>

      <div className="flex gap-1 border-b border-ds-border">
        <button
          type="button"
          onClick={() => setTab("conversations")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "conversations" ? "border-ds-accent text-ds-text-primary" : "border-transparent text-ds-text-secondary"}`}
        >
          Conversations ({conversations.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("leads")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "leads" ? "border-ds-accent text-ds-text-primary" : "border-transparent text-ds-text-secondary"}`}
        >
          Leads ({leads.length})
        </button>
      </div>

      {tab === "conversations" ? (
        <DataTable
          items={conversations}
          columns={CONVERSATION_COLUMNS}
          getRowId={(c) => c.id}
          caption="Conversations"
          emptyState="No conversations match this search."
          renderRow={(c) => (
            <TableRow href={`/apache/conversations/${c.id}`}>
              <TableCell>{c.businessName}</TableCell>
              <TableCell>{c.source ?? "Website"}</TableCell>
              <TableCell>
                <Badge tone={c.control === "human" ? "warning" : "muted"}>{c.control}</Badge>
              </TableCell>
              <TableCell>{c.needsAttention ? <Badge tone="danger">Needs attention</Badge> : "—"}</TableCell>
              <TableCell>{c.maskedContact ?? "—"}</TableCell>
              <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          )}
        />
      ) : (
        <DataTable
          items={leads}
          columns={LEAD_COLUMNS}
          getRowId={(l) => l.id}
          caption="Leads"
          emptyState="No leads match this search."
          renderRow={(l) => (
            <TableRow>
              <TableCell>{l.businessName}</TableCell>
              <TableCell>{l.status}</TableCell>
              <TableCell>
                <Badge tone={l.qualification === "hot" ? "danger" : l.qualification === "warm" ? "warning" : "muted"}>{l.qualification}</Badge>
              </TableCell>
              <TableCell direction="col">
                <span>{l.maskedEmail ?? l.maskedPhone ?? "—"}</span>
                {l.maskedEmail || l.maskedPhone ? <RevealButton leadId={l.id} businessId={l.businessId} /> : null}
              </TableCell>
              <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          )}
        />
      )}
    </div>
  );
}
