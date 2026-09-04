"use client";

import { useActionState } from "react";
import { refreshUrlKnowledgeDocumentAction } from "../actions";
import type { KnowledgeFormState } from "../actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: KnowledgeFormState = {};

export function RefreshUrlButton({ id, canEdit = true }: { id: string; canEdit?: boolean }) {
  const [state, formAction, isPending] = useActionState(refreshUrlKnowledgeDocumentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
