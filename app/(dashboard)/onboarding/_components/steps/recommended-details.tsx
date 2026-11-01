"use client";

import { useActionState } from "react";
import { saveOptionalDetailsAction, type OptionalDetailsState } from "../../actions";
import { BusinessHoursForm } from "../../../dashboard/business-hours/business-hours-form";
import type { BusinessHours } from "@/lib/supabase/types";

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

const initialState: OptionalDetailsState = {};

/**
 * The recommended (never blocking) details the readiness checklist asks for,
 * editable right here so the owner doesn't have to leave the wizard -- the
 * dashboard pages that normally hold them aren't reachable before publishing.
 */
export function RecommendedDetails({
  contactPhone,
  website,
  privacyPolicyUrl,
  hours,
  slaMinutes,
  timezone,
}: {
  contactPhone: string | null;
  website: string | null;
  privacyPolicyUrl: string | null;
  hours: BusinessHours[];
  slaMinutes: number | null;
  timezone: string;
}) {
  const [state, formAction, isPending] = useActionState(saveOptionalDetailsAction, initialState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <section className="flex flex-col gap-5 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">Add recommended details</h2>
        <p className="text-sm text-ds-text-secondary">
          Optional, and you can skip them. They make your agent more accurate, and you can change them later.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rd-phone" className="text-sm font-medium text-ds-text-primary">
            Contact phone
          </label>
          <input
            id="rd-phone"
            name="contactPhone"
            type="tel"
            autoComplete="tel"
            defaultValue={contactPhone ?? ""}
            placeholder="e.g. +91 98765 43210"
            disabled={isPending}
            aria-invalid={fieldErrors.contactPhone ? true : undefined}
            className={inputClasses}
          />
          {fieldErrors.contactPhone ? (
            <p role="alert" className="text-xs text-ds-danger">{fieldErrors.contactPhone}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rd-website" className="text-sm font-medium text-ds-text-primary">
            Website
          </label>
          <input
            id="rd-website"
            name="website"
            type="url"
            defaultValue={website ?? ""}
            placeholder="e.g. https://example.com"
            disabled={isPending}
            aria-invalid={fieldErrors.website ? true : undefined}
            className={inputClasses}
          />
          {fieldErrors.website ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.website}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rd-privacy" className="text-sm font-medium text-ds-text-primary">
            Your privacy policy URL
          </label>
          <input
            id="rd-privacy"
            name="privacyPolicyUrl"
            type="url"
            defaultValue={privacyPolicyUrl ?? ""}
            placeholder="https://example.com/privacy"
            disabled={isPending}
            aria-describedby="rd-privacy-help"
            aria-invalid={fieldErrors.privacyPolicyUrl ? true : undefined}
            className={inputClasses}
          />
          <p id="rd-privacy-help" className="text-xs text-ds-text-muted">
            The chat widget&rsquo;s consent notice links here. Must start with https://.
          </p>
          {fieldErrors.privacyPolicyUrl ? (
            <p role="alert" className="text-xs text-ds-danger">{fieldErrors.privacyPolicyUrl}</p>
          ) : null}
        </div>

        {state.error && !state.fieldErrors ? (
          <p role="alert" className="text-sm text-ds-danger">{state.error}</p>
        ) : null}
        {state.success ? (
          <p role="status" className="text-sm text-ds-success">Saved.</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Saving…" : "Save details"}
        </button>
      </form>

      <details className="flex flex-col gap-4 border-t border-ds-border pt-4" open={hours.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-ds-text-primary">Business hours</summary>
        <div className="pt-4">
          <BusinessHoursForm hours={hours} slaMinutes={slaMinutes} timezone={timezone} />
        </div>
      </details>
    </section>
  );
}
