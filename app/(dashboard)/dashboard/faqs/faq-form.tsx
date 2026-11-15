"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import type { FaqFormState } from "./actions";

const initialState: FaqFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60";
const labelClasses = "text-sm font-medium text-ds-text-primary";

export function FaqForm({
  action,
  id,
  initialQuestion = "",
  initialAnswer = "",
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  action: (prevState: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  id?: string;
  initialQuestion?: string;
  initialAnswer?: string;
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
        <label htmlFor="question" className={labelClasses}>
          Question <span className="text-ds-danger">*</span>
        </label>
        <input
          id="question"
          name="question"
          type="text"
          required
          minLength={1}
          maxLength={300}
          placeholder="e.g. What happens after I request a quote?"
          defaultValue={initialQuestion}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="answer" className={labelClasses}>
          Answer <span className="text-ds-danger">*</span>
        </label>
        <textarea
          id="answer"
          name="answer"
          rows={6}
          placeholder="Give a clear, complete answer using information approved by your business."
          required
          minLength={1}
          maxLength={2000}
          defaultValue={initialAnswer}
          disabled={isPending}
          className={`${inputClasses} leading-relaxed`}
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {id ? null : <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />}
        {isPending ? pendingLabel : submitLabel}
      </button>
      <p className="text-center text-sm text-ds-text-secondary">Saves as a draft</p>
    </form>
  );
}
