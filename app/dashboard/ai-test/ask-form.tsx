"use client";

import { useActionState } from "react";
import type { AskFormState } from "./actions";
import { askKnowledgeAction } from "./actions";

const initialState: AskFormState = {};

export function AskForm() {
  const [state, formAction, isPending] = useActionState(askKnowledgeAction, initialState);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="question" className="text-sm font-medium text-zinc-900">
            Question
          </label>
          <textarea
            id="question"
            name="question"
            rows={3}
            required
            minLength={1}
            maxLength={2000}
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
          className="w-fit rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Asking…" : "Ask"}
        </button>
      </form>

      {state.answer ? (
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 px-4 py-3">
          <p className="text-sm text-zinc-600">
            Question: <span className="text-zinc-900">{state.question}</span>
          </p>
          <p className="text-sm text-zinc-900">{state.answer}</p>
          <p className="text-xs text-zinc-500">
            {state.grounded ? "Grounded in retrieved knowledge." : "No matching knowledge -- fallback response."}
          </p>
          {state.sourceChunkIds && state.sourceChunkIds.length > 0 ? (
            <p className="text-xs text-zinc-500">Source chunk IDs: {state.sourceChunkIds.join(", ")}</p>
          ) : null}
          {state.escalate ? (
            <p className="text-xs font-medium text-amber-700">
              Escalate: {state.escalationReason ?? "no reason given"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
