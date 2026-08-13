"use client";

import { useActionState } from "react";
import type { UpdateStatusState } from "./actions";
import { updateLeadStatusAction } from "./actions";
import type { LeadStatus } from "@/lib/supabase/types";

const initialState: UpdateStatusState = {};

const STATUSES: LeadStatus[] = ["new", "contacted", "converted", "lost"];

export function StatusSelect({ id, status }: { id: string; status: LeadStatus }) {
  const [state, formAction, isPending] = useActionState(updateLeadStatusAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        disabled={isPending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-60"
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
