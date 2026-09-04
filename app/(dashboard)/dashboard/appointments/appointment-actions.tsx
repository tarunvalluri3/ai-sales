"use client";

import { useActionState } from "react";
import {
  confirmAppointmentAction,
  declineAppointmentAction,
  cancelAppointmentAction,
  type AppointmentActionState,
} from "./actions";
import type { AppointmentStatus } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: AppointmentActionState = {};

/** Confirm/Decline for a pending appointment, or Cancel for a confirmed one -- no action for declined/cancelled (terminal). */
export function AppointmentActions({
  id,
  status,
  canEdit = true,
}: {
  id: string;
  status: AppointmentStatus;
  canEdit?: boolean;
}) {
  const [confirmState, confirmFormAction, isConfirming] = useActionState(confirmAppointmentAction, initialState);
  const [declineState, declineFormAction, isDeclining] = useActionState(declineAppointmentAction, initialState);
  const [cancelState, cancelFormAction, isCancelling] = useActionState(cancelAppointmentAction, initialState);
  const disabled = isConfirming || isDeclining || isCancelling || !canEdit;
  const disabledTitle = canEdit ? undefined : ROLE_DENIED_TITLE;
  const error = confirmState.error ?? declineState.error ?? cancelState.error;

  if (status === "declined" || status === "cancelled") {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {status === "pending" ? (
          <>
            <form action={confirmFormAction}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={disabled}
                title={disabledTitle}
                className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-success transition-colors hover:bg-ds-success-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {isConfirming ? "Confirming…" : "Confirm"}
              </button>
            </form>
            <form action={declineFormAction}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={disabled}
                title={disabledTitle}
                className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
              >
                {isDeclining ? "Declining…" : "Decline"}
              </button>
            </form>
          </>
        ) : (
          <form action={cancelFormAction}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={disabled}
              title={disabledTitle}
              className="rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {isCancelling ? "Cancelling…" : "Cancel"}
            </button>
          </form>
        )}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
