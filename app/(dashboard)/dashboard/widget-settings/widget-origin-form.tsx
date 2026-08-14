"use client";

import { useActionState } from "react";
import { updateWidgetOrigin, type WidgetOriginState } from "./actions";

const initialState: WidgetOriginState = {};

export function WidgetOriginForm({ currentOrigin }: { currentOrigin: string | null }) {
  const [state, formAction, isPending] = useActionState(updateWidgetOrigin, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <label htmlFor="origin" className="text-xs font-medium text-ds-text-muted uppercase tracking-wide-ds">
        Origin
      </label>
      <input
        id="origin"
        name="origin"
        type="text"
        required
        placeholder="https://example.com"
        defaultValue={currentOrigin ?? ""}
        disabled={isPending}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "origin-error" : undefined}
        className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 font-mono text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus-visible:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
      />
      {state.error ? (
        <p id="origin-error" role="alert" className="rounded-ds-sm bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-ds-sm bg-ds-success-bg px-3 py-2 text-xs text-ds-success">Saved.</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-ds-md bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
