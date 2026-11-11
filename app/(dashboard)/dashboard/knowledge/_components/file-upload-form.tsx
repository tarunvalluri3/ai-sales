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
        Upload a .txt, .md, or .pdf file
      </label>
      <input
        id="knowledge-file"
        name="file"
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        required
        disabled={isPending}
        className="border border-ds-border bg-transparent px-3 py-2 text-sm text-ds-text-primary file:mr-3 file:file:border-0 file:bg-ds-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ds-text-primary disabled:opacity-60"
      />
      <p className="text-xs text-ds-text-muted">
        If your PDF is a product or service catalog, we&rsquo;ll extract it into structured products and
        services the first time you publish it, including a photo for each item when the PDF has one. You&rsquo;ll
        get to review everything before it goes live.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p className="text-sm text-ds-success">Uploaded.</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label self-start bg-ds-primary px-4 py-2 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
