"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ProductFormState } from "./actions";

const initialState: ProductFormState = {};

export function ProductForm({
  action,
  id,
  initialName = "",
  initialDescription = "",
  initialPrice = "",
  submitLabel,
  pendingLabel,
}: {
  action: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>;
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
    <form ref={formRef} action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-zinc-900">
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
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-zinc-900">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initialDescription}
          disabled={isPending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="text-sm font-medium text-zinc-900">
          Price (optional)
        </label>
        <input
          id="price"
          name="price"
          type="text"
          inputMode="decimal"
          placeholder="19.99"
          defaultValue={initialPrice}
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
