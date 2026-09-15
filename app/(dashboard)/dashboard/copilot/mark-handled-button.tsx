"use client";

import { useActionState } from "react";
import { dismissPriorityItemAction, type DismissState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import type { PriorityReasonKey } from "@/lib/copilot-lifecycle";

const initialState: DismissState = {};

/**
 * "Mark as handled" -- shared between the Today card and the Upcoming
 * row, since both need the exact same v1 `copilot_dismissals` action
 * (`dismissPriorityItemAction`, unchanged). Its own `useActionState` per
 * instance, same pattern as every other form on this page.
 */
export function MarkAsHandledButton({
  customerId,
  reasonKeys,
  canManage,
}: {
  customerId: string;
  reasonKeys: PriorityReasonKey[];
  canManage: boolean;
}) {
  const [state, formAction, isPending] = useActionState(dismissPriorityItemAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="customerId" value={customerId} />
      {reasonKeys.map((key) => (
        <input key={key} type="hidden" name="reasonKeys" value={key} />
      ))}
      <button
        type="submit"
        disabled={isPending || !canManage}
        title={canManage ? undefined : ROLE_DENIED_TITLE}
        className="w-fit rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Marking…" : "Mark as handled"}
      </button>
      {state.error ? (
        <span role="alert" className="ml-2 text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
