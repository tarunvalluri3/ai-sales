"use client";

import { useActionState, useEffect } from "react";
import type { DismissAttentionState } from "../conversations/actions";
import { dismissAttentionAction } from "../conversations/actions";

const initialState: DismissAttentionState = {};

export function DismissAttentionButton({
  conversationId,
  onDismissed,
}: {
  conversationId: string;
  onDismissed?: () => void;
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
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
      >
        Dismiss
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
