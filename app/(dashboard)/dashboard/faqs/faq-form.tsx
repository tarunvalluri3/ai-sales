"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FaqFormState } from "./actions";

const initialState: FaqFormState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

export function FaqForm({
  action,
  id,
  initialQuestion = "",
  initialAnswer = "",
  submitLabel,
  pendingLabel,
}: {
  action: (prevState: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  id?: string;
  initialQuestion?: string;
  initialAnswer?: string;
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
        <label htmlFor="question" className="text-sm font-medium text-ds-text-secondary">
          Question
        </label>
        <input
          id="question"
          name="question"
          type="text"
          required
          minLength={1}
          maxLength={300}
          defaultValue={initialQuestion}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="answer" className="text-sm font-medium text-ds-text-secondary">
          Answer
        </label>
        <textarea
          id="answer"
          name="answer"
          rows={4}
          required
          minLength={1}
          maxLength={2000}
          defaultValue={initialAnswer}
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
