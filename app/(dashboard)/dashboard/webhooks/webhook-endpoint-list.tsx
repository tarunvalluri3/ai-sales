"use client";

import { useActionState, useState } from "react";
import type { WebhookEndpoint } from "@/lib/supabase/types";
import { deleteWebhookEndpointAction, type WebhookActionState } from "./actions";
import { EmptyState } from "../_components/state-views";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { DataTable, TableCell, TableRow, type DataTableColumn } from "../_components/data-table";

const initialState: WebhookActionState = {};

const COLUMNS: DataTableColumn[] = [
  { key: "url", label: "Endpoint", width: "1.6fr" },
  { key: "secret", label: "Secret", width: "1.4fr" },
  { key: "created", label: "Created", width: "160px" },
  { key: "actions", label: "Actions", width: "100px", align: "right" },
];

function SecretReveal({ secret }: { secret: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2 py-1 font-mono text-xs text-ds-text-primary">
        {revealed ? secret : "•".repeat(24)}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        className="text-xs font-medium text-ds-accent-muted transition-colors hover:text-ds-accent"
      >
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
          <span className="min-w-0 truncate font-mono text-sm text-ds-text-primary">{endpoint.url}</span>
        </TableCell>
        <TableCell>
          <SecretReveal secret={endpoint.secret} />
        </TableCell>
        <TableCell>
          <span className="text-xs text-ds-text-muted">{new Date(endpoint.created_at).toLocaleString("en-US")}</span>
        </TableCell>
        <TableCell align="right">
          <form action={formAction}>
            <input type="hidden" name="id" value={endpoint.id} />
            <button
              type="submit"
              disabled={isPending || !canEdit}
              title={canEdit ? undefined : ROLE_DENIED_TITLE}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
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
      <EmptyState
        title="No webhook endpoints yet"
        description="Add one above to get notified on new qualified leads."
      />
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
