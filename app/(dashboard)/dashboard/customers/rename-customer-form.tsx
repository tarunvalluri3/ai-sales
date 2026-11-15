"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { renameCustomerAction, type ActionState } from "./actions";
import { btnPrimarySm, btnText } from "../_components/ui";
import { displayContactName } from "@/lib/lead-source";

const NAME_CLASS = "text-[28px] leading-[1.15] font-light sm:text-[32px] text-ds-text-primary";

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
    return <h1 className={NAME_CLASS}>{displayContactName(displayName) ?? "Unnamed prospect"}</h1>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        aria-label="Rename customer"
      >
        <h1 className={NAME_CLASS}>{displayContactName(displayName) ?? "Unnamed prospect"}</h1>
        <Pencil className="size-5 text-ds-text-primary transition-colors group-hover:text-ds-primary" strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={customerId} />
      <input
        type="text"
        name="displayName"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={200}
        autoFocus
        disabled={isPending}
        className="h-10 w-72 max-w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 text-sm font-medium text-ds-text-primary disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className={btnPrimarySm}
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
        className={btnText}
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
