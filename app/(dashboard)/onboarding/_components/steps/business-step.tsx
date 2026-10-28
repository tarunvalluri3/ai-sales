"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { BUSINESS_TYPES } from "@/lib/schemas/business";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import type { Business } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { createBusiness, type CreateBusinessState } from "../../actions";
import { updateBusinessProfileAction, type ProfileFormState } from "../../../dashboard/profile/actions";
import { useOnboardingPreview } from "../preview-context";

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

const DESCRIPTION_MIN = 40;

function noopSubscribe() {
  return () => {};
}

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

const createInitialState: CreateBusinessState = {};
const updateInitialState: ProfileFormState = {};

/**
 * Stage 1: "Your business". Reuses the real `createBusiness` (new
 * business) / `updateBusinessProfileAction` (revisiting an existing one)
 * Server Actions and their Zod schemas unchanged -- this only arranges
 * the fields. `contactEmail` is asked for here even though the pasted
 * spec didn't list it: every lead/appointment/handoff alert this app
 * sends goes to it (lib/schemas/business.ts), so collecting it up front
 * is a real requirement, not an invented one.
 */
export function BusinessStep({ business }: { business: Business | null }) {
  const router = useRouter();
  const isNew = business == null;
  const [createState, createFormAction, createPending] = useActionState(createBusiness, createInitialState);
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateBusinessProfileAction,
    updateInitialState,
  );
  const state = isNew ? createState : updateState;
  const isPending = isNew ? createPending : updatePending;

  const { update } = useOnboardingPreview();

  const [name, setName] = useState(business?.name ?? "");
  const [businessType, setBusinessType] = useState(business?.business_type ?? "");
  const [website, setWebsite] = useState(business?.website ?? "");
  const [description, setDescription] = useState(business?.description ?? "");
  const [contactEmail, setContactEmail] = useState(business?.contact_email ?? "");

  const detectedTimezone = useSyncExternalStore(noopSubscribe, getDetectedTimezone, getServerTimezone);
  const timezone = business?.timezone ?? detectedTimezone;

  const descriptionOk = description.trim().length >= DESCRIPTION_MIN;
  const emailOk = /\S+@\S+\.\S+/.test(contactEmail);
  const valid = name.trim().length >= 2 && businessType !== "" && descriptionOk && emailOk;

  const missing: string[] = [];
  if (name.trim().length < 2) missing.push("a business name");
  if (businessType === "") missing.push("an industry");
  if (!descriptionOk) missing.push(`${DESCRIPTION_MIN - description.trim().length} more characters in your description`);
  if (!emailOk) missing.push("a valid contact email");

  const formAction = isNew ? createFormAction : updateFormAction;
  const fieldErrors = state.fieldErrors ?? {};

  // Revisiting an already-created business: once the update succeeds,
  // move on to the next stage. The create path never reaches this --
  // `createBusiness` redirects itself on success.
  useEffect(() => {
    if (!isNew && updateState.success) {
      router.push("/onboarding?step=knowledge");
    }
  }, [isNew, updateState.success, router]);

  return (
    <form id="business-step-form" action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="timezone" value={timezone} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ds-text-primary">
          Business name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoFocus
          autoComplete="organization"
          placeholder="e.g. Glow Studio"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            update({ businessName: e.target.value });
          }}
          disabled={isPending}
          aria-invalid={fieldErrors.name ? true : undefined}
          className={inputClasses}
        />
        {fieldErrors.name ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.name}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ds-text-primary">Industry</span>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setBusinessType(type.value)}
              aria-pressed={businessType === type.value}
              disabled={isPending}
              className={`rounded-ds-sm border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                businessType === type.value
                  ? "border-ds-accent bg-ds-accent-soft-bg text-ds-text-primary"
                  : "border-ds-border text-ds-text-secondary hover:border-ds-border-strong"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="businessType" value={businessType} />
        {fieldErrors.businessType ? (
          <p role="alert" className="text-xs text-ds-danger">{fieldErrors.businessType}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="website" className="text-sm font-medium text-ds-text-primary">
          Website <span className="text-ds-text-muted">Optional</span>
        </label>
        <input
          id="website"
          name="website"
          type="url"
          placeholder="e.g. https://glowstudio.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={isPending}
          aria-invalid={fieldErrors.website ? true : undefined}
          className={inputClasses}
        />
        {fieldErrors.website ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.website}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ds-text-primary">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={500}
          placeholder="What you sell, where you are, and who you serve"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            update({ description: e.target.value });
          }}
          disabled={isPending}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby="description-help"
          className={inputClasses}
        />
        <div className="flex items-center justify-between">
          <p id="description-help" className="text-xs text-ds-text-muted">
            What you sell, where you are based, and who you serve.
          </p>
          <span className="text-xs text-ds-text-muted">{description.trim().length}/{DESCRIPTION_MIN}+</span>
        </div>
        {fieldErrors.description ? (
          <p role="alert" className="text-xs text-ds-danger">{fieldErrors.description}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contactEmail" className="text-sm font-medium text-ds-text-primary">
          Contact email
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          required
          placeholder="e.g. hello@glowstudio.com"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          disabled={isPending}
          aria-describedby="contactEmail-help"
          aria-invalid={fieldErrors.contactEmail ? true : undefined}
          className={inputClasses}
        />
        <p id="contactEmail-help" className="text-xs text-ds-text-muted">
          Lead, appointment and handoff alerts go here.
        </p>
        {fieldErrors.contactEmail ? (
          <p role="alert" className="text-xs text-ds-danger">{fieldErrors.contactEmail}</p>
        ) : null}
      </div>

      <input type="hidden" name="contactPhone" value={business?.contact_phone ?? ""} />

      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span />
        <div className="flex items-center gap-3">
          {!valid ? <span className="text-xs text-ds-text-muted">Add {missing[0]} to continue</span> : null}
          {isNew ? (
            // createBusiness redirects itself (Server Action `redirect()`)
            // straight to the knowledge step on success -- a plain submit,
            // not StepFooter's client-side router.push, so a server-side
            // validation failure can never be raced past.
            <button
              type="submit"
              disabled={isPending || !valid}
              className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {isPending ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending || !valid}
              onClick={() => {
                const formEl = document.getElementById("business-step-form") as HTMLFormElement;
                const data = new FormData(formEl);
                updateFormAction(data);
              }}
              className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              {isPending ? "Saving…" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
