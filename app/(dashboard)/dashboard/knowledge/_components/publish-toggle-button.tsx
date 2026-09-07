"use client";

import { useActionState, useState } from "react";
import type { PublishState } from "../actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: PublishState = {};

/**
 * `confirmMessage`, when passed, gates the actual submit behind a second
 * click -- used for "Unpublish" (which pulls a document out of the AI's
 * live reference context) but not "Publish" (which is additive and
 * reversible with the same one click).
 */
export function PublishToggleButton({
  action,
  id,
  label,
  pendingLabel,
  canEdit = true,
  confirmMessage,
}: {
  action: (prevState: PublishState, formData: FormData) => Promise<PublishState>;
  id: string;
  label: string;
  pendingLabel: string;
  canEdit?: boolean;
  confirmMessage?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  if (confirmMessage && confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ds-text-secondary">{confirmMessage}</span>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={isPending}
            autoFocus
            className="rounded-ds-sm bg-ds-danger px-2 py-1 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
          >
            {isPending ? pendingLabel : `Confirm ${label.toLowerCase()}`}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Cancel
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-ds-danger">
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex items-center gap-2"
      onSubmit={(event) => {
        if (confirmMessage) {
          event.preventDefault();
          setConfirming(true);
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="text-sm font-medium text-ds-accent-muted transition-colors hover:text-ds-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? pendingLabel : label}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
