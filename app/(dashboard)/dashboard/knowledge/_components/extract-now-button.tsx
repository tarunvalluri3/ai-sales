"use client";

import { useActionState } from "react";
import { extractNowAction } from "../actions";
import type { ExtractNowState } from "../actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: ExtractNowState = {};

/**
 * Manual escape hatch (Stage 2, STATE.md) to (re-)run catalog extraction
 * on a published document -- e.g. after a URL refresh adds new content.
 * Always rendered inside `RowActionsMenu` (2026-09-08 distill pass) --
 * label clarified from "Extract now" to name what it actually produces,
 * since a bare "Extract" is internal jargon once it's no longer sitting
 * next to obviously catalog-shaped content for context.
 */
export function ExtractNowButton({ id, canEdit = true }: { id: string; canEdit?: boolean }) {
  const [state, formAction, isPending] = useActionState(extractNowAction, initialState);

  return (
    <form action={formAction} className="block">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        role="menuitem"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="block w-full px-3.5 py-2 text-left text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Extracting…" : "Extract products & services"}
      </button>
      {state.error ? (
        <span role="alert" className="block px-3.5 py-1 text-xs text-ds-danger">
          {state.error}
        </span>
      ) : state.success ? (
        <span className="block px-3.5 py-1 text-xs text-ds-success">Started</span>
      ) : null}
    </form>
  );
}
