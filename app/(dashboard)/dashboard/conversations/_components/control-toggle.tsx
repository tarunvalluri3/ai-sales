"use client";

import { useActionState, useEffect } from "react";
import type { SetControlState } from "../actions";
import { setConversationControlAction } from "../actions";
import type { ConversationControl } from "@/lib/supabase/types";

const initialState: SetControlState = {};

export function ControlToggle({
  conversationId,
  control,
  onChanged,
}: {
  conversationId: string;
  control: ConversationControl;
  onChanged?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(setConversationControlAction, initialState);
  const nextControl: ConversationControl = control === "human" ? "ai" : "human";

  useEffect(() => {
    if (state.success) {
      onChanged?.();
    }
    // onChanged is expected to be a stable callback from the parent;
    // only re-run when the action actually produces a new success result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <span
        className={`rounded-ds-sm px-2.5 py-1 text-2xs font-semibold tracking-wide-ds uppercase ${
          control === "human"
            ? "bg-ds-warning-bg text-ds-warning"
            : "bg-ds-surface-soft text-ds-text-secondary"
        }`}
      >
        {control === "human" ? "Human-controlled" : "AI-handled"}
      </span>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={conversationId} />
        <input type="hidden" name="control" value={nextControl} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Updating…" : control === "human" ? "Hand back to AI" : "Take over this conversation"}
        </button>
      </form>

      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
