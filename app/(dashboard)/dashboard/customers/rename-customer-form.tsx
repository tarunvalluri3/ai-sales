"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { renameCustomerAction, type ActionState } from "./actions";

const initialState: ActionState = {};

export function RenameCustomerForm({
  customerId,
  displayName,
  canEdit,
}: {
  customerId: string;
  displayName: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [state, formAction, isPending] = useActionState(renameCustomerAction, initialState);

  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) setEditing(false);
  }

  if (!canEdit) {
    return <h1 className="text-[28px] leading-[1.15] font-light text-ds-text-primary sm:text-[32px]">{displayName ?? "Unnamed prospect"}</h1>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1.5 text-left"
        aria-label="Rename customer"
      >
        <h1 className="text-[28px] leading-[1.15] font-light text-ds-text-primary sm:text-[32px]">{displayName ?? "Unnamed prospect"}</h1>
        <Pencil className="size-3.5 text-ds-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={customerId} />
      <input
        type="text"
        name="displayName"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={200}
        autoFocus
        disabled={isPending}
        className="border border-ds-border bg-ds-surface-elevated px-2 py-1 text-sm text-ds-text-primary focus:border-ds-accent focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="ds-btn-label bg-ds-primary px-2 py-1 text-xs font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setName(displayName ?? "");
        }}
        disabled={isPending}
        className="px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60"
      >
        Cancel
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
