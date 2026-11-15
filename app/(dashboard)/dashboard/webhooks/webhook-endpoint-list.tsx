"use client";

import { useActionState, useState } from "react";
import type { WebhookEndpoint } from "@/lib/supabase/types";
import { deleteWebhookEndpointAction, type WebhookActionState } from "./actions";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { DataTable, TableCell, TableRow, type DataTableColumn } from "../_components/data-table";

const initialState: WebhookActionState = {};

const COLUMNS: DataTableColumn[] = [
  { key: "url", label: "Endpoint URL", width: "minmax(14rem,1.7fr)" },
  { key: "secret", label: "Signing secret", width: "minmax(16rem,1.3fr)" },
  { key: "created", label: "Created", width: "9rem" },
  { key: "actions", label: "Actions", width: "8rem" },
];

function SecretReveal({ secret }: { secret: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <code className={`min-w-0 flex-1 truncate font-mono text-ds-text-primary ${revealed ? "text-sm" : "text-lg tracking-widest"}`}>
        {revealed ? secret : "•".repeat(15)}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-pressed={revealed}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-ds-border-strong bg-ds-surface px-3 text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {revealed ? <EyeOff strokeWidth={1.75} className="size-4" aria-hidden="true" /> : <Eye strokeWidth={1.75} className="size-4" aria-hidden="true" />}
        {revealed ? "Hide" : "Reveal"}
      </button>
    </div>
  );
}

function WebhookEndpointRow({ endpoint, canEdit = true }: { endpoint: WebhookEndpoint; canEdit?: boolean }) {
  const [state, formAction, isPending] = useActionState(deleteWebhookEndpointAction, initialState);

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="min-w-0 truncate font-mono text-sm text-ds-text-primary" title={endpoint.url}>
            {endpoint.url}
          </span>
        </TableCell>
        <TableCell>
          <SecretReveal secret={endpoint.secret} />
        </TableCell>
        <TableCell>
          <span className="text-sm text-ds-text-primary">
            {new Date(endpoint.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </TableCell>
        <TableCell>
          <form action={formAction}>
            <input type="hidden" name="id" value={endpoint.id} />
            <button
              type="submit"
              disabled={isPending || !canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
            >
              <Trash2 className="size-5" strokeWidth={1.75} aria-hidden="true" />
              {isPending ? "Deleting…" : "Delete"}
            </button>
          </form>
        </TableCell>
      </TableRow>
      {state.error ? (
        <TableRow>
          <TableCell className="col-span-full">
            <span role="alert" className="text-xs text-ds-danger">
              {state.error}
            </span>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Client half of the Webhooks list -- retrofitted onto the shared
 * DataTable (codebase gap sweep, Phase E). Each row keeps its own
 * `useActionState` for delete (unchanged from before the retrofit) --
 * WebhookEndpointRow is a real component, so this is still a normal
 * hook call per row, not a hook inside a loop. A row's delete error
 * renders as a second, full-width TableRow directly beneath it, the
 * same "main row + detail row" Fragment shape LeadRow already uses for
 * its own expandable detail row.
 */
export function WebhookEndpointList({
  endpoints,
  canEdit = true,
}: {
  endpoints: WebhookEndpoint[];
  canEdit?: boolean;
}) {
  if (endpoints.length === 0) {
    return (
      <p className="rounded-2xl bg-ds-surface-soft px-4 py-6 text-center text-sm text-ds-text-secondary">
        No webhook endpoints yet. Add one above to get notified on new qualified leads.
      </p>
    );
  }

  return (
    <DataTable
      items={endpoints}
      columns={COLUMNS}
      getRowId={(endpoint) => endpoint.id}
      caption="Webhook endpoints"
      renderRow={(endpoint) => <WebhookEndpointRow endpoint={endpoint} canEdit={canEdit} />}
    />
  );
}
