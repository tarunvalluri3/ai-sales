"use client";

import { useActionState } from "react";
import { ROLE_DENIED_TITLE } from "./delete-button";

export type ReviewActionState = {
  error?: string;
  success?: boolean;
};

const initialState: ReviewActionState = {};

/**
 * Shared Approve/Reject control for a product/service/FAQ row extracted
 * from a knowledge document and awaiting review (Stage 2, STATE.md).
 * `approveAction`/`rejectAction` must be Server Actions with the
 * `(prevState, formData) => ReviewActionState` shape, matching
 * `DeleteButton`'s convention. `canEdit` (Phase P2#10, default `true`)
 * follows the same server-computed-boolean convention as
 * `DeleteButton`'s own prop.
 */
export function ReviewActions({
  approveAction,
  rejectAction,
  id,
  canEdit = true,
}: {
  approveAction: (prevState: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
  rejectAction: (prevState: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
  id: string;
  canEdit?: boolean;
}) {
  const [approveState, approveFormAction, isApproving] = useActionState(approveAction, initialState);
  const [rejectState, rejectFormAction, isRejecting] = useActionState(rejectAction, initialState);
  const disabled = isApproving || isRejecting || !canEdit;

  return (
    <div className="flex shrink-0 items-center gap-3">
      <form action={approveFormAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={disabled}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-success transition-colors hover:bg-ds-success-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isApproving ? "Approving…" : "Approve"}
        </button>
      </form>
      <form action={rejectFormAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={disabled}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isRejecting ? "Rejecting…" : "Reject"}
        </button>
      </form>
      {approveState.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {approveState.error}
        </span>
      ) : null}
      {rejectState.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {rejectState.error}
        </span>
      ) : null}
    </div>
  );
}
