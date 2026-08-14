"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProfileFormState } from "./actions";
import { updateBusinessProfileAction } from "./actions";

const initialState: ProfileFormState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

export function ProfileForm({
  initialName,
  initialDescription,
  initialContactEmail,
  initialContactPhone,
  initialWebsite,
}: {
  initialName: string;
  initialDescription: string;
  initialContactEmail: string;
  initialContactPhone: string;
  initialWebsite: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessProfileAction,
    initialState,
  );
  const reduceMotion = useReducedMotion();

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
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
          defaultValue={initialName}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-ds-text-secondary">
          Description <span className="text-ds-text-muted">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={initialDescription}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="contactEmail" className="text-sm font-medium text-ds-text-secondary">
          Contact email <span className="text-ds-text-muted">(optional)</span>
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          placeholder="hello@example.com"
          defaultValue={initialContactEmail}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="contactPhone" className="text-sm font-medium text-ds-text-secondary">
          Contact phone <span className="text-ds-text-muted">(optional)</span>
        </label>
        <input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          placeholder="+1 555 123 4567"
          defaultValue={initialContactPhone}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="website" className="text-sm font-medium text-ds-text-secondary">
          Website <span className="text-ds-text-muted">(optional)</span>
        </label>
        <input
          id="website"
          name="website"
          type="url"
          placeholder="https://example.com"
          defaultValue={initialWebsite}
          disabled={isPending}
          className={inputClasses}
        />
      </div>
      <AnimatePresence mode="wait">
        {state.error ? (
          <motion.p
            key="error"
            role="alert"
            className="text-sm text-ds-danger"
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {state.error}
          </motion.p>
        ) : null}
        {state.success ? (
          <motion.p
            key="success"
            className="text-sm text-ds-success"
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            Profile updated.
          </motion.p>
        ) : null}
      </AnimatePresence>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
