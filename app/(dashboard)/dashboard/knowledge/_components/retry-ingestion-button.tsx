"use client";

import { useActionState } from "react";
import type { RetryIngestionState } from "../actions";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: RetryIngestionState = {};

/**
 * Re-queues a dead-lettered ('failed') knowledge document for ingestion.
 * `canEdit`: see DeleteButton's doc comment. Always the row's single
 * primary action when shown (2026-09-08 distill pass): a failed document
 * needs this fixed before anything else about it matters, so it takes
 * the one solid-accent slot rather than competing with Publish/Edit for
 * it -- see knowledge/page.tsx's primary-action selection.
 */
export function RetryIngestionButton({
  action,
  id,
  canEdit = true,
}: {
  action: (prevState: RetryIngestionState, formData: FormData) => Promise<RetryIngestionState>;
  id: string;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="rounded-ds-sm bg-ds-accent px-3 py-1.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
