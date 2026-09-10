"use client";

import { useActionState } from "react";
import { createExceptionAction, deleteExceptionAction, type ExceptionActionState } from "../exceptions-actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: ExceptionActionState = {};

/**
 * The one-click primary action for the most common case (closing a whole
 * day for a holiday or leave) -- reuses the same createExceptionAction/
 * deleteExceptionAction the Advanced panel's form uses, just pre-filled
 * with the day already being viewed instead of asking the admin to pick
 * a date and a mode. Not shown at all when this date already has a
 * partial/opening override -- the availability page's own logic decides
 * that and passes a null `closedExceptionId` with the toggle omitted.
 */
export function DayCloseToggle({
  date,
  closedExceptionId,
  canEdit,
}: {
  date: string;
  closedExceptionId: string | null;
  canEdit: boolean;
}) {
  const [createState, createFormAction, isClosing] = useActionState(createExceptionAction, initialState);
  const [deleteState, deleteFormAction, isReopening] = useActionState(deleteExceptionAction, initialState);
  const isPending = isClosing || isReopening;
  const error = createState.error ?? deleteState.error;
  const disabledTitle = canEdit ? undefined : ROLE_DENIED_TITLE;

  return (
    <div className="flex flex-col items-end gap-1">
      {closedExceptionId ? (
        <form action={deleteFormAction}>
          <input type="hidden" name="id" value={closedExceptionId} />
          <button
            type="submit"
            disabled={isPending || !canEdit}
            title={disabledTitle}
            className="rounded-ds-sm border border-ds-border px-3 py-1.5 text-sm font-medium text-ds-success transition-colors hover:bg-ds-success-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isReopening ? "Reopening…" : "Reopen this day"}
          </button>
        </form>
      ) : (
        <form action={createFormAction}>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="mode" value="close_all_day" />
          <button
            type="submit"
            disabled={isPending || !canEdit}
            title={disabledTitle}
            className="rounded-ds-sm border border-ds-border px-3 py-1.5 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isClosing ? "Closing…" : "Close this day"}
          </button>
        </form>
      )}
      {error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
