"use client";

import { useActionState } from "react";

export type DeleteState = {
  error?: string;
  success?: boolean;
};

const initialState: DeleteState = {};

/**
 * Shared delete control for products/services/FAQs rows. `action` must be
 * a Server Action with the `(prevState, formData) => DeleteState` shape
 * (all three types' delete actions match this).
 */
export function DeleteButton({
  action,
  id,
  label = "Delete",
}: {
  action: (prevState: DeleteState, formData: FormData) => Promise<DeleteState>;
  id: string;
  label?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
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
