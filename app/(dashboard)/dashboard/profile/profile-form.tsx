"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProfileFormState } from "./actions";
import { updateBusinessProfileAction } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: ProfileFormState = {};

// text-ds-text-secondary (not the muted token) on both the placeholder and the
// legend below: --ds-text-muted fails WCAG AA against --ds-surface-elevated/
// --ds-surface (~3.4-3.6:1, audit finding); --ds-text-secondary already clears
// AA here (~7:1) and is already used elsewhere on this page for real content.
const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-secondary transition-colors focus:border-ds-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60";

const legendClasses = "text-2xs font-medium tracking-wide-ds text-ds-text-secondary uppercase";

/**
 * `canEdit` (default `true`) disables every input/button rather than
 * swapping in a separate read-only view -- same pattern as
 * BusinessHoursForm/WidgetBrandingForm: a lower-role viewer should still
 * see the business's current profile, just not change it.
 */
export function ProfileForm({
  initialName,
  initialDescription,
  initialContactEmail,
  initialContactPhone,
  initialWebsite,
  canEdit = true,
}: {
  initialName: string;
  initialDescription: string;
  initialContactEmail: string;
  initialContactPhone: string;
  initialWebsite: string;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateBusinessProfileAction,
    initialState,
  );
  const reduceMotion = useReducedMotion();
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex w-full flex-col gap-6">
      {/* Visually hidden: gives screen-reader users navigating by heading a landmark for this
          card, without a second visible "Profile details" line competing with the page h1. */}
      <h2 className="sr-only">Profile details</h2>

      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className={`mb-1 p-0 ${legendClasses}`}>Identity</legend>
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
            disabled={isPending || !canEdit}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.name ? (
            <p id="name-error" className="text-xs text-ds-danger">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium text-ds-text-secondary">
            Description <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="A short line about what your business does"
            defaultValue={initialDescription}
            disabled={isPending || !canEdit}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? "description-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.description ? (
            <p id="description-error" className="text-xs text-ds-danger">
              {fieldErrors.description}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className={`mb-1 p-0 ${legendClasses}`}>Contact</legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="contactEmail" className="text-sm font-medium text-ds-text-secondary">
            Contact email <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            placeholder="hello@example.com"
            defaultValue={initialContactEmail}
            disabled={isPending || !canEdit}
            aria-invalid={fieldErrors.contactEmail ? true : undefined}
            aria-describedby={fieldErrors.contactEmail ? "contactEmail-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.contactEmail ? (
            <p id="contactEmail-error" className="text-xs text-ds-danger">
              {fieldErrors.contactEmail}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className="text-sm font-medium text-ds-text-secondary">
            Contact phone <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            placeholder="+1 555 123 4567"
            defaultValue={initialContactPhone}
            disabled={isPending || !canEdit}
            aria-invalid={fieldErrors.contactPhone ? true : undefined}
            aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.contactPhone ? (
            <p id="contactPhone-error" className="text-xs text-ds-danger">
              {fieldErrors.contactPhone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="website" className="text-sm font-medium text-ds-text-secondary">
            Website <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://example.com"
            defaultValue={initialWebsite}
            disabled={isPending || !canEdit}
            aria-invalid={fieldErrors.website ? true : undefined}
            aria-describedby={fieldErrors.website ? "website-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.website ? (
            <p id="website-error" className="text-xs text-ds-danger">
              {fieldErrors.website}
            </p>
          ) : null}
        </div>
      </fieldset>

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
            role="status"
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
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-3 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
