"use client";

import { useActionState, useEffect } from "react";
import {
  confirmAppointmentAction,
  declineAppointmentAction,
  cancelAppointmentAction,
  completeAppointmentAction,
  noShowAppointmentAction,
  type AppointmentActionState,
} from "./actions";
import type { AppointmentStatus } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { useToast } from "../_components/toast";

const initialState: AppointmentActionState = {};

const SUCCESS_MESSAGE: Record<"confirm" | "decline" | "cancel" | "complete" | "no_show", string> = {
  confirm: "Appointment confirmed",
  decline: "Appointment declined",
  cancel: "Appointment cancelled",
  complete: "Marked completed",
  no_show: "Marked no-show",
};

const successStyle =
  "rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-success transition-colors hover:bg-ds-success-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";
const dangerStyle =
  "rounded-ds-sm px-2 py-1 text-sm font-medium text-ds-danger transition-colors hover:bg-ds-danger-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

/**
 * Confirm/Decline for a pending appointment; a confirmed one gets Cancel
 * while its time is still upcoming, or Mark completed/Mark no-show once
 * `isPastDue` (2026-09-10 follow-up -- a meeting that already happened
 * shouldn't still offer "Cancel"). No action for the five terminal
 * statuses (declined/cancelled/completed/no_show).
 */
export function AppointmentActions({
  id,
  status,
  isPastDue,
  canEdit = true,
}: {
  id: string;
  status: AppointmentStatus;
  isPastDue: boolean;
  canEdit?: boolean;
}) {
  const { toast } = useToast();
  const [confirmState, confirmFormAction, isConfirming] = useActionState(confirmAppointmentAction, initialState);
  const [declineState, declineFormAction, isDeclining] = useActionState(declineAppointmentAction, initialState);
  const [cancelState, cancelFormAction, isCancelling] = useActionState(cancelAppointmentAction, initialState);
  const [completeState, completeFormAction, isCompleting] = useActionState(completeAppointmentAction, initialState);
  const [noShowState, noShowFormAction, isMarkingNoShow] = useActionState(noShowAppointmentAction, initialState);
  const disabled = isConfirming || isDeclining || isCancelling || isCompleting || isMarkingNoShow || !canEdit;
  const disabledTitle = canEdit ? undefined : ROLE_DENIED_TITLE;
  const error = confirmState.error ?? declineState.error ?? cancelState.error ?? completeState.error ?? noShowState.error;

  // Each useActionState's own state object is a fresh reference per
  // dispatch, so an effect keyed on it fires exactly once per real
  // action, not on every re-render -- no toast on initial mount, since
  // `initialState` never carries `success: true`.
  useEffect(() => {
    if (confirmState.success) toast({ title: SUCCESS_MESSAGE.confirm, variant: "success" });
  }, [confirmState, toast]);
  useEffect(() => {
    if (declineState.success) toast({ title: SUCCESS_MESSAGE.decline, variant: "success" });
  }, [declineState, toast]);
  useEffect(() => {
    if (cancelState.success) toast({ title: SUCCESS_MESSAGE.cancel, variant: "success" });
  }, [cancelState, toast]);
  useEffect(() => {
    if (completeState.success) toast({ title: SUCCESS_MESSAGE.complete, variant: "success" });
  }, [completeState, toast]);
  useEffect(() => {
    if (noShowState.success) toast({ title: SUCCESS_MESSAGE.no_show, variant: "success" });
  }, [noShowState, toast]);

  if (status === "declined" || status === "cancelled" || status === "completed" || status === "no_show") {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {status === "pending" ? (
          <>
            <form action={confirmFormAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={disabled} title={disabledTitle} className={successStyle}>
                {isConfirming ? "Confirming…" : "Confirm"}
              </button>
            </form>
            <form action={declineFormAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={disabled} title={disabledTitle} className={dangerStyle}>
                {isDeclining ? "Declining…" : "Decline"}
              </button>
            </form>
          </>
        ) : isPastDue ? (
          <>
            <form action={completeFormAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={disabled} title={disabledTitle} className={successStyle}>
                {isCompleting ? "Marking…" : "Mark completed"}
              </button>
            </form>
            <form action={noShowFormAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={disabled} title={disabledTitle} className={dangerStyle}>
                {isMarkingNoShow ? "Marking…" : "Mark no-show"}
              </button>
            </form>
          </>
        ) : (
          <form action={cancelFormAction}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" disabled={disabled} title={disabledTitle} className={dangerStyle}>
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
