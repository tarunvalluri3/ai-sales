"use client";

import { useActionState, useState } from "react";

export type DeleteState = {
  error?: string;
  success?: boolean;
};

const initialState: DeleteState = {};

/** Server-authored, matches `lib/auth.ts`'s `requireMinRole()` denial text exactly. */
export const ROLE_DENIED_TITLE = "You don't have permission to do this.";

/**
 * Shared delete control for products/services/FAQs/knowledge rows. `action`
 * must be a Server Action with the `(prevState, formData) => DeleteState`
 * shape (all these types' delete actions match this). `canEdit` (Phase
 * P2#10, default `true` for other still-ungated callers) is computed
 * server-side via `hasMinRole()` and passed down as a plain boolean --
 * this client component never imports `lib/auth.ts` itself, keeping
 * authorization logic server-only per AGENTS.md §9.
 *
 * `confirmMessage`, when passed, gates the actual submit behind a second
 * click: the first click swaps the button for an inline "message + Confirm
 * + Cancel" row instead of submitting immediately. Callers where deletion
 * is low-stakes (or where a one-click delete is the established pattern)
 * omit it and keep the original single-click behavior.
 */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  canEdit = true,
  confirmMessage,
}: {
  action: (prevState: DeleteState, formData: FormData) => Promise<DeleteState>;
  id: string;
  label?: string;
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
            {isPending ? "Deleting…" : "Confirm delete"}
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
        className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Deleting…" : label}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
