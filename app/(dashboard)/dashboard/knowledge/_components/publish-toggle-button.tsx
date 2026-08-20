"use client";

import { useActionState } from "react";
import type { PublishState } from "../actions";

const initialState: PublishState = {};

export function PublishToggleButton({
  action,
  id,
  label,
  pendingLabel,
}: {
  action: (prevState: PublishState, formData: FormData) => Promise<PublishState>;
  id: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
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
