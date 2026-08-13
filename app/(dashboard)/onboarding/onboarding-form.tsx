"use client";

import { useActionState } from "react";
import { createBusiness, type CreateBusinessState } from "./actions";

const initialState: CreateBusinessState = {};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(
    createBusiness,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="name" className="text-sm font-medium text-zinc-900">
        Business name
      </label>
      <input
        id="name"
        name="name"
        type="text"
        required
        minLength={2}
        maxLength={120}
        autoComplete="organization"
        disabled={isPending}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "name-error" : undefined}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
      />
      {state.error ? (
        <p id="name-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create business"}
      </button>
    </form>
  );
}
