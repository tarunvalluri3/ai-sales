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
 *
 * `variant` (2026-09-08, knowledge page distill pass): `"primary"` is the
 * row's single solid accent action (Publish, when nothing more urgent
 * claims that slot); `"menuitem"` is a full-width row for a
 * `RowActionsMenu` dropdown (Unpublish, always -- pulling a document out
 * of the AI's live context is never the row's single most prominent
 * action).
 */
const TRIGGER_CLASS = {
  primary:
    "rounded-ds-sm bg-ds-accent px-3 py-1.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent",
  menuitem:
    "block w-full px-3.5 py-2 text-left text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent",
} as const;

export function PublishToggleButton({
  action,
  id,
  label,
  pendingLabel,
  canEdit = true,
  confirmMessage,
  variant = "menuitem",
}: {
  action: (prevState: PublishState, formData: FormData) => Promise<PublishState>;
  id: string;
  label: string;
  pendingLabel: string;
  canEdit?: boolean;
  confirmMessage?: string;
  variant?: "primary" | "menuitem";
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);
  const isMenuItem = variant === "menuitem";

  if (confirmMessage && confirming) {
    return (
      <div
        role={isMenuItem ? "group" : undefined}
        aria-label={isMenuItem ? confirmMessage : undefined}
        className={isMenuItem ? "flex flex-col gap-2 px-3.5 py-2" : "flex items-center gap-2"}
      >
        <span className="text-xs text-ds-text-secondary">{confirmMessage}</span>
        <div className="flex items-center gap-2">
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              role={isMenuItem ? "menuitem" : undefined}
              disabled={isPending}
              autoFocus
              className="rounded-ds-sm bg-ds-danger px-2 py-1 text-sm font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger"
            >
              {isPending ? pendingLabel : `Confirm ${label.toLowerCase()}`}
            </button>
          </form>
          <button
            type="button"
            role={isMenuItem ? "menuitem" : undefined}
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            Cancel
          </button>
        </div>
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
      className={isMenuItem ? "block" : "flex items-center gap-2"}
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
        role={isMenuItem ? "menuitem" : undefined}
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className={TRIGGER_CLASS[variant]}
      >
        {isPending ? pendingLabel : label}
      </button>
      {state.error ? (
        <span role="alert" className={isMenuItem ? "block px-3.5 py-1 text-xs text-ds-danger" : "text-xs text-ds-danger"}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
