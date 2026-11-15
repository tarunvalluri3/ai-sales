"use client";

import { useActionState } from "react";
import { blockSlotAction, unblockSlotAction, type SlotBlockActionState } from "./slot-actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: SlotBlockActionState = {};

/** Toggle for one open/blocked slot in the visual grid -- Block or Unblock, whichever applies. */
export function SlotRowAction({ startsAt, isBlocked, canEdit }: { startsAt: string; isBlocked: boolean; canEdit: boolean }) {
  const [state, formAction, isPending] = useActionState(isBlocked ? unblockSlotAction : blockSlotAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="startsAt" value={startsAt} />
        <button
          type="submit"
          disabled={isPending || !canEdit}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="inline-flex h-9 items-center rounded-full border border-ds-border-strong bg-ds-surface px-4 text-sm font-medium text-ds-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {isPending ? (isBlocked ? "Unblocking…" : "Blocking…") : isBlocked ? "Unblock" : "Block"}
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
