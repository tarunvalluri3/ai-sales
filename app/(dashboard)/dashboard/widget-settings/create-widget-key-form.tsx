"use client";

import { useActionState } from "react";
import { createWidgetKeyAction, type WidgetKeyActionState } from "./actions";

const initialState: WidgetKeyActionState = {};

export function CreateWidgetKeyForm() {
  const [state, formAction, isPending] = useActionState(createWidgetKeyAction, initialState);

  return (
    <section className="flex flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-ds-text-primary">Create a new widget key</h2>
        <p className="text-xs text-ds-text-secondary">
          Useful for rotating an existing key, or adding a key scoped to a new site. Leave origins
          blank to create the key first and configure origins after.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <label htmlFor="new-key-origins" className="text-xs font-medium text-ds-text-muted uppercase tracking-wide-ds">
          Allowed origins (one per line)
        </label>
        <textarea
          id="new-key-origins"
          name="origins"
          rows={2}
          placeholder="https://example.com"
          disabled={isPending}
          className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
        />
        {state.error ? (
          <p role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-ds-sm bg-ds-success-bg px-3 py-2 text-xs text-ds-success">Key created.</p>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create key"}
        </button>
      </form>
    </section>
  );
}
