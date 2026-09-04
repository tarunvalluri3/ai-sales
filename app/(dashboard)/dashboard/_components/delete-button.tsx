"use client";

import { useActionState } from "react";

export type DeleteState = {
  error?: string;
  success?: boolean;
};

const initialState: DeleteState = {};

/** Server-authored, matches `lib/auth.ts`'s `requireMinRole()` denial text exactly. */
export const ROLE_DENIED_TITLE = "You don't have permission to do this.";

/**
 * Shared delete control for products/services/FAQs rows. `action` must be
 * a Server Action with the `(prevState, formData) => DeleteState` shape
 * (all three types' delete actions match this). `canEdit` (Phase P2#10,
 * default `true` for other still-ungated callers) is computed
 * server-side via `hasMinRole()` and passed down as a plain boolean --
 * this client component never imports `lib/auth.ts` itself, keeping
 * authorization logic server-only per AGENTS.md §9.
 */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  canEdit = true,
}: {
  action: (prevState: DeleteState, formData: FormData) => Promise<DeleteState>;
  id: string;
  label?: string;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
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
