"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileText, FileUp, Info, X } from "lucide-react";
import { createFileKnowledgeDocumentAction } from "../actions";
import type { KnowledgeFormState } from "../actions";

const initialState: KnowledgeFormState = {};

/**
 * File upload as a drop zone. The real `<input type="file">` is stretched
 * invisibly over the dashed area, so clicking it opens the picker and
 * dropping a file onto it selects that file natively: no custom drag
 * handling, and the form still posts the file exactly as before. The chosen
 * file's name is mirrored underneath (display only).
 */
export function FileUploadForm() {
  const [state, formAction, isPending] = useActionState(createFileKnowledgeDocumentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // A successful upload resets the form, so drop the mirrored name with it
  // (adjusted during render, keyed on the action result).
  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) setFileName(null);
  }

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  function clearFile() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="relative flex flex-col items-center gap-1 rounded-xl border border-dashed border-ds-border-strong px-4 py-7 text-center transition-colors focus-within:border-ds-primary hover:bg-ds-surface-soft">
        <FileUp className="size-10 text-ds-text-primary" strokeWidth={1.5} aria-hidden="true" />
        <label htmlFor="knowledge-file" className="text-sm font-medium text-ds-text-primary">
          Drop a file here
        </label>
        <p className="text-sm text-ds-text-primary">
          or <span className="font-medium text-ds-primary underline underline-offset-4">choose a file</span>
        </p>
        <p className="text-sm text-ds-text-secondary">.txt, .md or .pdf</p>
        <input
          ref={inputRef}
          id="knowledge-file"
          name="file"
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          required
          disabled={isPending}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>

      {fileName ? (
        <div className="flex items-center gap-3 rounded-xl border border-ds-border px-4 py-3">
          <FileText className="size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-ds-text-primary">{fileName}</span>
            <span className="text-sm text-ds-text-secondary">Ready to upload</span>
          </div>
          <button
            type="button"
            onClick={clearFile}
            disabled={isPending}
            aria-label="Remove selected file"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            <X strokeWidth={1.75} className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex gap-3 rounded-xl bg-ds-surface-soft px-4 py-3">
        <Info className="mt-0.5 size-5 shrink-0 text-ds-text-primary" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-ds-text-primary">Uploading a PDF catalog?</p>
          <p className="text-sm leading-relaxed text-ds-text-secondary">
            We&rsquo;ll extract it into structured products and services the first time you publish it, including a photo
            for each item when the PDF has one. You&rsquo;ll get to review everything before it goes live.
          </p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success">
          Uploaded.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
