"use client";

import { useActionState, useState } from "react";
import type { WebhookEndpoint } from "@/lib/supabase/types";
import { deleteWebhookEndpointAction, type WebhookActionState } from "./actions";
import { EmptyState } from "../_components/state-views";

const initialState: WebhookActionState = {};

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

function WebhookEndpointRow({ endpoint }: { endpoint: WebhookEndpoint }) {
  const [state, formAction, isPending] = useActionState(deleteWebhookEndpointAction, initialState);

  return (
    <li className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-sm text-ds-text-primary">{endpoint.url}</p>
        <form action={formAction}>
          <input type="hidden" name="id" value={endpoint.id} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </form>
      </div>
      <SecretReveal secret={endpoint.secret} />
      <p className="text-xs text-ds-text-muted">Created {new Date(endpoint.created_at).toLocaleString()}</p>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </li>
  );
}

export function WebhookEndpointList({ endpoints }: { endpoints: WebhookEndpoint[] }) {
  if (endpoints.length === 0) {
    return (
      <EmptyState
        title="No webhook endpoints yet"
        description="Add one above to get notified on new qualified leads."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {endpoints.map((endpoint) => (
        <WebhookEndpointRow key={endpoint.id} endpoint={endpoint} />
      ))}
    </ul>
  );
}
