"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { createWidgetKeyAction, type WidgetKeyActionState } from "./actions";
import { btnOutline, helpClass, inputClass, labelClass, textareaClass } from "../_components/ui";

const initialState: WidgetKeyActionState = {};

export function CreateWidgetKeyForm() {
  const [state, formAction, isPending] = useActionState(createWidgetKeyAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-ds-border p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-ds-text-primary">Create a new widget key</h3>
        <p className="dx-subtitle">Use a separate key for another website, or to rotate an existing key.</p>
      </div>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-key-name" className={labelClass}>
            Nickname <span className="font-normal text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="new-key-name"
            name="name"
            type="text"
            maxLength={100}
            placeholder="e.g. Landing page"
            disabled={isPending}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-key-origins" className={labelClass}>
            Allowed origins <span className="font-normal text-ds-text-secondary">(optional, add later)</span>
          </label>
          <textarea
            id="new-key-origins"
            name="origins"
            rows={2}
            placeholder="https://example.com"
            disabled={isPending}
            aria-describedby="new-key-origins-hint"
            className={`${textareaClass} font-mono`}
          />
          <p id="new-key-origins-hint" className={helpClass}>
            Only these exact website addresses can use this key. One per line, no page path or trailing slash.
          </p>
        </div>
        {state.error ? (
          <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-xs text-ds-danger">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className="rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success">
            Key created.
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className={`${btnOutline} w-full`}>
          <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />
          {isPending ? "Creating…" : "Create key"}
        </button>
      </form>
    </section>
  );
}
