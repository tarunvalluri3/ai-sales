"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info } from "lucide-react";
import type { ProfileFormState } from "./actions";
import { updateBusinessProfileAction } from "./actions";
import { BUSINESS_TYPES } from "@/lib/schemas/business";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { btnPrimary } from "../_components/ui";

const initialState: ProfileFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:bg-ds-surface-soft disabled:text-ds-text-muted aria-invalid:border-ds-danger";
const labelClasses = "text-sm font-medium text-ds-text-primary";
const errorClasses = "text-sm text-ds-danger";

/**
 * `canEdit` (default `true`) disables every input/button rather than
 * swapping in a separate read-only view -- same pattern as
 * BusinessHoursForm/WidgetBrandingForm: a lower-role viewer should still
 * see the business's current profile, just not change it.
 *
 * Two fieldsets, each laid out as a heading column beside its fields:
 * "Business identity" (name, type, description) and "Contact details"
 * (email, phone, website).
 */
export function ProfileForm({
  initialName,
  initialBusinessType,
  initialDescription,
  initialContactEmail,
  initialContactPhone,
  initialWebsite,
  canEdit = true,
}: {
  initialName: string;
  initialBusinessType: string;
  initialDescription: string;
  initialContactEmail: string;
  initialContactPhone: string;
  initialWebsite: string;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateBusinessProfileAction, initialState);
  const reduceMotion = useReducedMotion();
  const fieldErrors = state.fieldErrors ?? {};
  const disabled = isPending || !canEdit;

  return (
    <form action={formAction} className="flex w-full flex-col">
      <fieldset className="m-0 grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 border-0 p-0 pb-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <legend className="sr-only">Business identity</legend>
        <div className="flex flex-col gap-1.5 lg:border-r lg:border-ds-border lg:pr-6" aria-hidden="true">
          <p className="text-sm leading-tight font-medium text-ds-text-primary">Business identity</p>
          <p className="text-sm text-ds-text-secondary">Introduce your business to prospects.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className={labelClasses}>
                Business name <span className="text-ds-danger">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                defaultValue={initialName}
                disabled={disabled}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                className={inputClasses}
              />
              {fieldErrors.name ? (
                <p id="name-error" className={errorClasses}>
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="businessType" className={labelClasses}>
                Business type
              </label>
              <select
                id="businessType"
                name="businessType"
                required
                defaultValue={initialBusinessType}
                disabled={disabled}
                aria-invalid={fieldErrors.businessType ? true : undefined}
                aria-describedby={fieldErrors.businessType ? "businessType-error" : undefined}
                className={inputClasses}
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {fieldErrors.businessType ? (
                <p id="businessType-error" className={errorClasses}>
                  {fieldErrors.businessType}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className={labelClasses}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              maxLength={500}
              placeholder="A short line about what your business does"
              defaultValue={initialDescription}
              disabled={disabled}
              aria-invalid={fieldErrors.description ? true : undefined}
              aria-describedby={fieldErrors.description ? "description-error" : undefined}
              className={`${inputClasses} leading-relaxed`}
            />
            {fieldErrors.description ? (
              <p id="description-error" className={errorClasses}>
                {fieldErrors.description}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="m-0 grid min-w-0 grid-cols-1 gap-x-8 gap-y-4 border-0 border-t border-ds-border p-0 py-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <legend className="sr-only">Contact details</legend>
        <div className="flex flex-col gap-1.5 lg:border-r lg:border-ds-border lg:pr-6" aria-hidden="true">
          <p className="text-sm leading-tight font-medium text-ds-text-primary">Contact details</p>
          <p className="text-sm text-ds-text-secondary">Help customers and your team stay connected.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contactEmail" className={labelClasses}>
              Contact email
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              placeholder="hello@example.com"
              defaultValue={initialContactEmail}
              disabled={disabled}
              aria-invalid={fieldErrors.contactEmail ? true : undefined}
              aria-describedby={fieldErrors.contactEmail ? "contactEmail-error contactEmail-hint" : "contactEmail-hint"}
              className={inputClasses}
            />
            {fieldErrors.contactEmail ? (
              <p id="contactEmail-error" className={errorClasses}>
                {fieldErrors.contactEmail}
              </p>
            ) : null}
            <p id="contactEmail-hint" className="flex items-center gap-2.5 rounded-xl bg-ds-surface-soft px-3.5 py-2 text-sm text-ds-text-primary">
              <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              This email also receives handover alerts, appointment updates, lead notifications and billing emails.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contactPhone" className={labelClasses}>
                Contact phone
              </label>
              <input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                placeholder="+1 555 123 4567"
                defaultValue={initialContactPhone}
                disabled={disabled}
                aria-invalid={fieldErrors.contactPhone ? true : undefined}
                aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined}
                className={inputClasses}
              />
              {fieldErrors.contactPhone ? (
                <p id="contactPhone-error" className={errorClasses}>
                  {fieldErrors.contactPhone}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="website" className={labelClasses}>
                Website
              </label>
              <input
                id="website"
                name="website"
                type="url"
                placeholder="https://example.com"
                defaultValue={initialWebsite}
                disabled={disabled}
                aria-invalid={fieldErrors.website ? true : undefined}
                aria-describedby={fieldErrors.website ? "website-error" : undefined}
                className={inputClasses}
              />
              {fieldErrors.website ? (
                <p id="website-error" className={errorClasses}>
                  {fieldErrors.website}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </fieldset>

      <AnimatePresence mode="wait">
        {state.error ? (
          <motion.p
            key="error"
            role="alert"
            className="mb-4 rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger"
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
            className="mb-4 rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success"
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            Profile updated.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4">
        <p className="text-sm text-ds-text-secondary">Saved changes go live after publishing.</p>
        <button type="submit" disabled={disabled} title={canEdit ? undefined : ROLE_DENIED_TITLE} className={`${btnPrimary} min-w-48`}>
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
