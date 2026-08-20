"use client";

import { useActionState, useEffect, useRef } from "react";
import { createFileKnowledgeDocumentAction } from "../actions";
import type { KnowledgeFormState } from "../actions";

const initialState: KnowledgeFormState = {};

export function FileUploadForm() {
  const [state, formAction, isPending] = useActionState(createFileKnowledgeDocumentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <label htmlFor="knowledge-file" className="text-sm font-medium text-ds-text-secondary">
        Upload a .txt or .md file
      </label>
      <input
        id="knowledge-file"
        name="file"
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        required
        disabled={isPending}
        className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary file:mr-3 file:rounded-ds-sm file:border-0 file:bg-ds-accent-soft-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ds-accent-muted disabled:opacity-60"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-sm text-ds-success">Uploaded.</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
