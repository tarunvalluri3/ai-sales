"use client";

import { useActionState } from "react";
import { dismissPriorityItemAction, type DismissState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import type { PriorityReasonKey } from "@/lib/copilot-lifecycle";
import { Check } from "lucide-react";

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
        className="ds-btn-label inline-flex h-10 items-center gap-2 rounded-xl border border-ds-border-strong bg-ds-surface px-4 text-sm text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        <Check strokeWidth={1.75} className="size-4" aria-hidden="true" />
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
