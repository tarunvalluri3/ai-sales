"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ServiceFormState } from "./actions";

const initialState: ServiceFormState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

export function ServiceForm({
  action,
  id,
  initialName = "",
  initialDescription = "",
  initialPrice = "",
  submitLabel,
  pendingLabel,
}: {
  action: (prevState: ServiceFormState, formData: FormData) => Promise<ServiceFormState>;
  id?: string;
  initialName?: string;
  initialDescription?: string;
  initialPrice?: string;
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
        <label htmlFor="name" className="text-sm font-medium text-ds-text-secondary">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={120}
          defaultValue={initialName}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-ds-text-secondary">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initialDescription}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="text-sm font-medium text-ds-text-secondary">
          Price <span className="text-ds-text-muted">(optional)</span>
        </label>
        <input
          id="price"
          name="price"
          type="text"
          inputMode="decimal"
          placeholder="19.99"
          defaultValue={initialPrice}
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
