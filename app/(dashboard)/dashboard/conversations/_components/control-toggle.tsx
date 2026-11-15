"use client";

import { useActionState, useEffect } from "react";
import type { SetControlState } from "../actions";
import { setConversationControlAction } from "../actions";
import type { ConversationControl } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";
import { Info, Sparkles, UserRound } from "lucide-react";
import { btnGhostSm, btnPrimarySm } from "../../_components/ui";

const initialState: SetControlState = {};

export function ControlToggle({
  conversationId,
  control,
  needsAttention = false,
  onChanged,
  canEdit = true,
}: {
  conversationId: string;
  control: ConversationControl;
  needsAttention?: boolean;
  onChanged?: () => void;
  canEdit?: boolean;
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

  const isHuman = control === "human";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex h-10 items-center gap-2.5 rounded-full px-4 text-sm font-medium ${
            isHuman ? "bg-ds-lime-soft text-ds-primary" : "bg-ds-surface-soft text-ds-text-primary"
          }`}
        >
          {isHuman ? (
            <UserRound className="size-5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
          )}
          {isHuman ? "Human-controlled" : "AI-handled"}
        </span>

        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={conversationId} />
          <input type="hidden" name="control" value={nextControl} />
          <button
            type="submit"
            disabled={isPending || !canEdit}
            title={canEdit ? undefined : ROLE_DENIED_TITLE}
            className={isHuman ? btnGhostSm : btnPrimarySm}
          >
            {isHuman ? (
              <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <UserRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
            )}
            {isPending ? "Updating…" : isHuman ? "Hand back to AI" : "Take over this conversation"}
          </button>
        </form>
      </div>

      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}

      <p className="flex items-start gap-2 text-sm text-ds-text-secondary">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>
          {isHuman
            ? "AI replies are paused while you're in control. Hand it back anytime to let the AI respond again."
            : needsAttention
              ? "Taking over pauses AI replies and clears this conversation's alert. You can hand it back anytime."
              : "Taking over pauses AI replies for this conversation. You can hand it back anytime."}
        </span>
      </p>
    </div>
  );
}
