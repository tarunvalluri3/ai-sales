"use client";

import { useActionState, useEffect, useRef } from "react";
import { createWebhookEndpointAction, type WebhookActionState } from "./actions";

const initialState: WebhookActionState = {};

export function CreateWebhookForm() {
  const [state, formAction, isPending] = useActionState(createWebhookEndpointAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <h2 className="text-sm font-medium text-ds-text-primary">Add an endpoint</h2>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <input
          name="url"
          type="url"
          required
          placeholder="https://example.com/webhooks/ai-sales"
          disabled={isPending}
          className="flex-1 rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-ds-md bg-ds-accent px-4 py-2.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add endpoint"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
