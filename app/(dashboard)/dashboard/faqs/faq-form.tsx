"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FaqFormState } from "./actions";

const initialState: FaqFormState = {};

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
    <form ref={formRef} action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="question" className="text-sm font-medium text-zinc-900">
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
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="answer" className="text-sm font-medium text-zinc-900">
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
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-dashboard-primary px-3 py-2 text-sm font-medium text-dashboard-on-primary hover:bg-dashboard-primary-hover disabled:opacity-60"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
