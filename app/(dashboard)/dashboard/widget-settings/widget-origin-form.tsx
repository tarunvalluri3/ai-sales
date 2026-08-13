"use client";

import { useActionState } from "react";
import { updateWidgetOrigin, type WidgetOriginState } from "./actions";

const initialState: WidgetOriginState = {};

export function WidgetOriginForm({ currentOrigin }: { currentOrigin: string | null }) {
  const [state, formAction, isPending] = useActionState(updateWidgetOrigin, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="origin" className="text-sm font-medium text-zinc-900">
        Allowed widget origin
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
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
      />
      <p className="text-xs text-zinc-600">
        The widget only accepts requests carrying this exact origin. Until this is set, the
        widget key above rejects every request.
      </p>
      {state.error ? (
        <p id="origin-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-sm text-green-700">Saved.</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
