"use client";

import { useActionState } from "react";
import { refreshUrlKnowledgeDocumentAction } from "../actions";
import type { KnowledgeFormState } from "../actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: KnowledgeFormState = {};

/** Re-fetches a URL-sourced document's content on demand. Always rendered inside `RowActionsMenu` (2026-09-08 distill pass) -- label clarified to name what's being refreshed, since it no longer sits next to the source URL for context. */
export function RefreshUrlButton({ id, canEdit = true }: { id: string; canEdit?: boolean }) {
  const [state, formAction, isPending] = useActionState(refreshUrlKnowledgeDocumentAction, initialState);

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
        {isPending ? "Refreshing…" : "Refresh from URL"}
      </button>
      {state.error ? (
        <span role="alert" className="block px-3.5 py-1 text-xs text-ds-danger">
          {state.error}
        </span>
      ) : state.success ? (
        <span className="block px-3.5 py-1 text-xs text-ds-success">Refreshed.</span>
      ) : null}
    </form>
  );
}
