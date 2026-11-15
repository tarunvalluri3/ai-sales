"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { UpdateStatusState } from "./actions";
import { updateLeadStatusAction } from "./actions";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "./lead-status";
import type { LeadStatus } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: UpdateStatusState = {};

const CONFIRMATION_VISIBLE_MS = 6000;

const STATUS_TINT: Record<LeadStatus, string> = {
  new: "border-ds-border-strong bg-ds-surface text-ds-text-primary",
  contacted: "border-ds-border-strong bg-ds-surface text-ds-text-primary",
  converted: "border-ds-primary bg-ds-primary text-ds-primary-on",
  lost: "border-ds-border bg-ds-surface-soft text-ds-text-secondary",
};

/**
 * `lost` is the one transition worth a pause before it fires: every other
 * status is a quick, low-stakes re-pick, but nothing else on this row
 * hints a lead was ever marked lost once it changes again, so a misclick
 * here is the one that's genuinely hard to notice and walk back
 * (/impeccable harden, closing the critique's "auto-submits instantly,
 * zero friction to reverse" finding). Every transition, "lost" included,
 * also gets a post-save "Changed to X · Undo" confirmation -- the part of
 * that finding that applied to all four statuses, not just this one.
 */
export function StatusSelect({
  id,
  status,
  canEdit = true,
}: {
  id: string;
  status: LeadStatus;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateLeadStatusAction, initialState);
  const [displayedStatus, setDisplayedStatus] = useState(status);
  const [confirmingLost, setConfirmingLost] = useState(false);
  const [confirmation, setConfirmation] = useState<{ from: LeadStatus; to: LeadStatus } | null>(null);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the just-completed dispatch represents -- `state.success`/`error`
  // alone can repeat the same value across two different dispatches, so
  // this is what actually tells the effect below what changed.
  const lastChangeRef = useRef<{ from: LeadStatus; to: LeadStatus } | null>(null);

  useEffect(() => {
    if (state.success && lastChangeRef.current) {
      setConfirmation(lastChangeRef.current);
      if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = setTimeout(() => setConfirmation(null), CONFIRMATION_VISIBLE_MS);
    } else if (state.error) {
      // The lead's real status never changed server-side -- snap the
      // select back to it instead of leaving the DOM showing whatever
      // the user picked while an error banner says it didn't save.
      setDisplayedStatus(status);
      setConfirmingLost(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    return () => {
      if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
    };
  }, []);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setDisplayedStatus(event.currentTarget.value as LeadStatus);
    event.currentTarget.form?.requestSubmit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const next = new FormData(event.currentTarget).get("status");
    if (typeof next !== "string") return;
    const nextStatus = next as LeadStatus;
    if (nextStatus === "lost" && !confirmingLost) {
      event.preventDefault();
      setConfirmingLost(true);
      return;
    }
    lastChangeRef.current = { from: displayedStatus, to: nextStatus };
    setConfirmingLost(false);
  }

  if (confirmingLost) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ds-text-secondary">Mark as lost?</span>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value="lost" />
            <button
              type="submit"
              disabled={isPending}
              autoFocus
              onClick={() => {
                lastChangeRef.current = { from: displayedStatus, to: "lost" };
              }}
              className="inline-flex h-8 items-center rounded-lg bg-ds-danger px-3 text-xs font-medium text-ds-danger-on transition-colors hover:bg-ds-danger/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-danger pointer-coarse:min-h-11 pointer-coarse:px-3.5"
            >
              {isPending ? "Saving…" : "Confirm lost"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setConfirmingLost(false)}
            disabled={isPending}
            className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary pointer-coarse:min-h-11 pointer-coarse:px-3.5"
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
    <div className="flex flex-col items-start gap-1.5">
      <form onSubmit={handleSubmit} action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <select
          name="status"
          aria-label="Lead status"
          value={displayedStatus}
          disabled={isPending || !canEdit}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          onChange={handleChange}
          className={`h-10 min-h-0 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:min-h-11 ${STATUS_TINT[displayedStatus]}`}
        >
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value} className="bg-ds-surface text-ds-text-primary">
              {LEAD_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </form>
      {confirmation ? (
        <span aria-live="polite" className="flex items-center gap-2 text-xs text-ds-text-secondary">
          Changed to {LEAD_STATUS_LABEL[confirmation.to]}
          <form
            action={formAction}
            onSubmit={() => {
              lastChangeRef.current = { from: confirmation.to, to: confirmation.from };
              setDisplayedStatus(confirmation.from);
              if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
              setConfirmation(null);
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={confirmation.from} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center rounded-md font-medium text-ds-primary underline-offset-4 hover:underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary pointer-coarse:min-h-11"
            >
              Undo
            </button>
          </form>
        </span>
      ) : state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
