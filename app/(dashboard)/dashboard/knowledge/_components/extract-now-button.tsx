"use client";

import { useActionState } from "react";
import { extractNowAction } from "../actions";
import type { ExtractNowState } from "../actions";

const initialState: ExtractNowState = {};

/** Manual escape hatch (Stage 2, STATE.md) to (re-)run catalog extraction on a published document -- e.g. after a URL refresh adds new content. */
export function ExtractNowButton({ id }: { id: string }) {
  const [state, formAction, isPending] = useActionState(extractNowAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Extracting…" : "Extract now"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : state.success ? (
        <span className="text-xs text-ds-success">Started</span>
      ) : null}
    </form>
  );
}
