"use client";

import { useActionState, useEffect } from "react";
import type { DismissAttentionState } from "../conversations/actions";
import { dismissAttentionAction } from "../conversations/actions";
import { ROLE_DENIED_TITLE } from "./delete-button";

const initialState: DismissAttentionState = {};

export function DismissAttentionButton({
  conversationId,
  onDismissed,
  canEdit = true,
}: {
  conversationId: string;
  onDismissed?: () => void;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(dismissAttentionAction, initialState);

  useEffect(() => {
    if (state.success) {
      onDismissed?.();
    }
    // onDismissed is expected to be a stable callback from the parent;
    // only re-run when the action actually produces a new success result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="rounded-ds-sm border border-ds-border-strong px-3 py-1.5 text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Dismissing…" : "Dismiss"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
