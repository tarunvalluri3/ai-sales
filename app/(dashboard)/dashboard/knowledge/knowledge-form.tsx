"use client";

import { useActionState, useEffect, useRef } from "react";
import type { KnowledgeFormState } from "./actions";

const initialState: KnowledgeFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60";

export function KnowledgeForm({
  action,
  id,
  initialTitle = "",
  initialContent = "",
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  action: (prevState: KnowledgeFormState, formData: FormData) => Promise<KnowledgeFormState>;
  id?: string;
  initialTitle?: string;
  initialContent?: string;
  submitLabel: string;
  pendingLabel: string;
  /** Called once after a successful submit, in addition to the existing reset-on-add behavior -- lets a caller editing in place (no navigation to a dedicated edit page) know when to exit edit mode. */
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      if (!id) formRef.current?.reset();
      onSuccess?.();
    }
  }, [state.success, id, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3.5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-ds-text-primary">
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="content" className="text-sm font-medium text-ds-text-primary">
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
        <p className="text-xs text-ds-text-secondary">Up to 20,000 characters.</p>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
