"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createBusiness, type CreateBusinessState } from "./actions";
import { BUSINESS_TYPES } from "@/lib/schemas/business";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

const initialState: CreateBusinessState = {};

const TOTAL_STEPS = 4;

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary transition-colors focus:border-ds-accent-muted focus:outline-none disabled:opacity-60";

const labelClasses = "text-sm font-medium text-ds-text-secondary";

function noopSubscribe() {
  return () => {};
}

/** Client-only: the browser's own IANA timezone, if it's one this app curates. */
function getDetectedTimezone(): string {
  try {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_OPTIONS.includes(guess) ? guess : "UTC";
  } catch {
    return "UTC";
  }
}

function getServerTimezone(): string {
  return "UTC";
}

/**
 * 4-step wizard (2026-09-11): name + business type, then optional
 * description/website, contact info, and timezone. All fields stay mounted
 * in one <form> so their values survive Back/Next -- only the current
 * step's fieldset is shown (`hidden` attribute, same convention as the rest
 * of this app), and the server action is only ever submitted once, on the
 * final step -- no intermediate round-trips.
 */
export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(createBusiness, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");

  // Guess the browser's timezone via useSyncExternalStore (not an effect +
  // setState) so the common case needs zero clicks on step 4, without a
  // server/client hydration mismatch: getServerTimezone always returns
  // "UTC" for the server-rendered pass, then React re-syncs to the real
  // client snapshot right after hydration.
  const detectedTimezone = useSyncExternalStore(noopSubscribe, getDetectedTimezone, getServerTimezone);
  const [timezoneOverride, setTimezoneOverride] = useState<string | null>(null);
  const timezone = timezoneOverride ?? detectedTimezone;

  const canAdvanceFromStep1 = name.trim().length >= 2 && businessType !== "";

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4 text-left">
      <p className="text-center text-xs font-medium text-ds-text-secondary">
        Step {step} of {TOTAL_STEPS}
      </p>

      <div className={step === 1 ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className={labelClasses}>
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
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isPending}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.name ? (
            <p id="name-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="businessType" className={labelClasses}>
            Business type
          </label>
          <select
            id="businessType"
            name="businessType"
            required
            value={businessType}
            onChange={(event) => setBusinessType(event.target.value)}
            disabled={isPending}
            aria-invalid={fieldErrors.businessType ? true : undefined}
            aria-describedby={fieldErrors.businessType ? "businessType-error" : undefined}
            className={inputClasses}
          >
            <option value="" disabled>
              Choose a business type
            </option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {fieldErrors.businessType ? (
            <p id="businessType-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.businessType}
            </p>
          ) : null}
        </div>
      </div>

      <div className={step === 2 ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className={labelClasses}>
            Description <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="A short line about what your business does"
            disabled={isPending}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? "description-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.description ? (
            <p id="description-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="website" className={labelClasses}>
            Website <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://example.com"
            disabled={isPending}
            aria-invalid={fieldErrors.website ? true : undefined}
            aria-describedby={fieldErrors.website ? "website-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.website ? (
            <p id="website-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.website}
            </p>
          ) : null}
        </div>
      </div>

      <div className={step === 3 ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-col gap-1">
          <label htmlFor="contactEmail" className={labelClasses}>
            Contact email <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            placeholder="hello@example.com"
            disabled={isPending}
            aria-invalid={fieldErrors.contactEmail ? true : undefined}
            aria-describedby={fieldErrors.contactEmail ? "contactEmail-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.contactEmail ? (
            <p id="contactEmail-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.contactEmail}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contactPhone" className={labelClasses}>
            Contact phone <span className="text-ds-text-secondary">(optional)</span>
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            placeholder="+1 555 123 4567"
            disabled={isPending}
            aria-invalid={fieldErrors.contactPhone ? true : undefined}
            aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined}
            className={inputClasses}
          />
          {fieldErrors.contactPhone ? (
            <p id="contactPhone-error" role="alert" className="text-xs text-ds-danger">
              {fieldErrors.contactPhone}
            </p>
          ) : null}
        </div>
      </div>

      <div className={step === 4 ? "flex flex-col gap-3" : "hidden"}>
        <div className="flex flex-col gap-1">
          <label htmlFor="timezone" className={labelClasses}>
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={timezone}
            onChange={(event) => setTimezoneOverride(event.target.value)}
            disabled={isPending}
            className={inputClasses}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            disabled={isPending}
            className="rounded-ds-sm border border-ds-border px-3 py-2 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60"
          >
            Back
          </button>
        ) : null}
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep((current) => current + 1)}
            disabled={isPending || (step === 1 && !canAdvanceFromStep1)}
            className="flex-1 rounded-ds-sm bg-ds-accent px-3 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60"
          >
            Next
          </button>
        ) : (
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-ds-sm bg-ds-accent px-3 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60"
          >
            {isPending ? "Creating…" : "Create business"}
          </button>
        )}
      </div>
    </form>
  );
}
