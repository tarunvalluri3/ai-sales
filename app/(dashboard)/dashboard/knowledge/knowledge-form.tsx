"use client";

import { useActionState, useEffect, useRef } from "react";
import type { KnowledgeFormState } from "./actions";

const initialState: KnowledgeFormState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

export function KnowledgeForm({
  action,
  id,
  initialTitle = "",
  initialContent = "",
  submitLabel,
  pendingLabel,
}: {
  action: (prevState: KnowledgeFormState, formData: FormData) => Promise<KnowledgeFormState>;
  id?: string;
  initialTitle?: string;
  initialContent?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && !id) {
      formRef.current?.reset();
    }
  }, [state.success, id]);

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-ds-text-secondary">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          minLength={1}
          maxLength={200}
          defaultValue={initialTitle}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-sm font-medium text-ds-text-secondary">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          rows={10}
          required
          minLength={1}
          maxLength={20000}
          defaultValue={initialContent}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
