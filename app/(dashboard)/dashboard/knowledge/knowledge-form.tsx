"use client";

import { useActionState, useEffect, useRef } from "react";
import type { KnowledgeFormState } from "./actions";

const initialState: KnowledgeFormState = {};

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
    <form ref={formRef} action={formAction} className="flex w-full max-w-lg flex-col gap-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-zinc-900">
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
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="content" className="text-sm font-medium text-zinc-900">
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
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
