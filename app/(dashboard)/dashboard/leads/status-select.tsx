"use client";

import { useActionState } from "react";
import type { UpdateStatusState } from "./actions";
import { updateLeadStatusAction } from "./actions";
import type { LeadStatus } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: UpdateStatusState = {};

const STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

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

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        aria-label="Lead status"
        defaultValue={status}
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-2.5 py-1.5 text-sm text-ds-text-primary capitalize transition-colors hover:border-ds-border-strong focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {STATUSES.map((value) => (
          <option key={value} value={value} className="bg-ds-surface-elevated text-ds-text-primary capitalize">
            {value}
          </option>
        ))}
      </select>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
