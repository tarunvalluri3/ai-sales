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
      <label htmlFor="name" className="text-sm font-medium text-ds-text-secondary">
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
        className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary transition-colors focus:border-ds-accent-muted focus:outline-none disabled:opacity-60"
      />
      {state.error ? (
        <p id="name-error" role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-ds-sm bg-ds-accent px-3 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create business"}
      </button>
    </form>
  );
}
