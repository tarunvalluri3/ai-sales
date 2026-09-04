"use client";

import { useActionState } from "react";
import { publishBusinessAction, type PublishBusinessState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: PublishBusinessState = {};

export function PublishButton({ isPublished, canEdit = true }: { isPublished: boolean; canEdit?: boolean }) {
  const [state, formAction, isPending] = useActionState(publishBusinessAction, initialState);
  const published = isPublished || state.success === true;

  return (
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ds-text-primary">
            {published ? "Published" : "Not published yet"}
          </h2>
          <p className="max-w-xl text-sm text-ds-text-secondary">
            {published
              ? "Your widget keys will serve real chat to visitors. Publishing again is safe and just refreshes the status."
              : "Prospects can't chat with this business yet -- your widget keys won't respond until you publish. Test it above first."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-ds-sm px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide-ds ${
            published ? "bg-ds-success-bg text-ds-success" : "bg-ds-warning-bg text-ds-warning"
          }`}
        >
          {published ? "Live" : "Draft"}
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending || !canEdit}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Publishing…" : published ? "Republish" : "Publish"}
        </button>
      </form>
    </div>
  );
}
