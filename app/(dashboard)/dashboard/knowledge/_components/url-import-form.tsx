"use client";

import { useActionState, useEffect, useRef } from "react";
import { createUrlKnowledgeDocumentAction } from "../actions";
import type { KnowledgeFormState } from "../actions";

const initialState: KnowledgeFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60";

export function UrlImportForm() {
  const [state, formAction, isPending] = useActionState(createUrlKnowledgeDocumentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="url-title" className="text-sm font-medium text-ds-text-primary">
          Title
        </label>
        <input id="url-title" name="title" type="text" required maxLength={200} disabled={isPending} className={inputClasses} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="url" className="text-sm font-medium text-ds-text-primary">
          Page URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://example.com/page"
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="refreshIntervalHours" className="text-sm font-medium text-ds-text-primary">
          Auto-refresh (optional)
        </label>
        <input
          id="refreshIntervalHours"
          name="refreshIntervalHours"
          type="number"
          min={1}
          max={720}
          placeholder="e.g. 24"
          disabled={isPending}
          className={inputClasses}
        />
        <p className="text-xs leading-relaxed text-ds-text-secondary">
          How often to re-check this page, in hours (1-720, up to 30 days). Leave blank to import it once and
          never refresh it automatically.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success">
          Imported.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {isPending ? "Importing…" : "Import"}
      </button>
    </form>
  );
}
