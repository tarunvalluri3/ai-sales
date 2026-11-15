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
    <section className="dx-card flex flex-col gap-4 dx-card-pad">
      <div className="flex flex-col gap-0.5">
        <h2 className="dx-title">Add an endpoint</h2>
        <p className="dx-subtitle text-base">Enter the URL that should receive lead notifications.</p>
      </div>
      <label htmlFor="webhook-url" className="text-sm font-medium text-ds-text-primary">
        URL
      </label>
      <form ref={formRef} action={formAction} className="-mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <input
          id="webhook-url"
          name="url"
          type="url"
          required
          placeholder="https://example.com/webhooks/ai-sales"
          disabled={isPending}
          className="h-10 min-w-0 flex-1 rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-base text-ds-text-primary placeholder:text-ds-text-faint disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="ds-btn-label inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add endpoint"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
