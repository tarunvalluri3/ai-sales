"use client";

import { useActionState } from "react";
import { addWidgetOriginAction, type WidgetKeyActionState } from "../widget-settings/actions";
import { btnPrimary, inputClass } from "./ui";

const initialState: WidgetKeyActionState = {};

/** Welcome-card form: one website address becomes an allowed origin on the widget key. */
export function AddOriginForm() {
  const [state, formAction, isPending] = useActionState(addWidgetOriginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2" noValidate>
      <label htmlFor="launch-origin" className="text-xs font-medium text-ds-text-primary">
        Your website address
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="launch-origin"
          name="origin"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          required
          aria-describedby="launch-origin-help"
          aria-invalid={state.error ? true : undefined}
          className={`${inputClass} min-w-0 flex-1 basis-56`}
        />
        <button type="submit" disabled={isPending} className={`${btnPrimary} min-h-11`}>
          {isPending ? "Saving…" : "Add website"}
        </button>
      </div>
      <p id="launch-origin-help" className="text-xs text-ds-text-muted">
        Just the address, like https://example.com. No page path and no trailing slash.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-ds-success">
          Website added. Your widget will answer visitors on that site.
        </p>
      ) : null}
    </form>
  );
}
