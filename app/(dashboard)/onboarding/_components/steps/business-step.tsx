"use client";

import { defaultWeeklyHours } from "@/lib/business-hours-defaults";
import { summarizeWeeklyHours } from "@/lib/business-hours-summary";
import { WeeklyHoursFields } from "../../../dashboard/business-hours/weekly-hours-fields";
import { HoursSummary } from "../hours-summary";
import { Check } from "lucide-react";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { BUSINESS_TYPES, looksLikeClerkOrganizationDefault } from "@/lib/schemas/business";
import { detectBrowserTimezone } from "@/lib/timezones";
import { SUPPORTED_CURRENCIES, currencyForTimezone } from "@/lib/currency";
import { TimezonePicker } from "../../../dashboard/_components/timezone-picker";
import type { Business, BusinessHours } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { createBusiness, type CreateBusinessState } from "../../actions";
import { updateBusinessProfileAction, type ProfileFormState } from "../../../dashboard/profile/actions";
import { useOnboardingPreview } from "../preview-context";

const inputClasses =
  "border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

const DESCRIPTION_MIN = 40;

function noopSubscribe() {
  return () => {};
}

// The browser's zone, normalised ("Asia/Calcutta" -> "Asia/Kolkata"). The
// server snapshot is "" (unknown), never "UTC": a form submitted before the
// browser value is read gets a "choose your time zone" error, not UTC hours.
function getDetectedTimezone(): string {
  return detectBrowserTimezone() ?? "";
}

function getServerTimezone(): string {
  return "";
}

const createInitialState: CreateBusinessState = {};
const updateInitialState: ProfileFormState = {};

export function BusinessStep({ business, initialName = "", initialEmail = "", hours = [] }: { business: Business | null; initialName?: string; initialEmail?: string; hours?: BusinessHours[] }) {
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

  const [name, setName] = useState(business?.name ?? initialName);
  const [businessType, setBusinessType] = useState(business?.business_type ?? "");
  const [website, setWebsite] = useState(business?.website ?? "");
  const [week, setWeek] = useState(defaultWeeklyHours);
  const [hoursAccepted, setHoursAccepted] = useState(false);
  const [hoursEdited, setHoursEdited] = useState(false);
  const [description, setDescription] = useState(business?.description ?? "");
  const [contactEmail, setContactEmail] = useState(business?.contact_email ?? initialEmail);
  const [contactPhone, setContactPhone] = useState(business?.contact_phone ?? "");

  const detectedTimezone = useSyncExternalStore(noopSubscribe, getDetectedTimezone, getServerTimezone);
  const [chosenTimezone, setChosenTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone ?? business?.timezone ?? detectedTimezone;
  const timezoneIsDetected = chosenTimezone === null && !business && detectedTimezone !== "";
  // Follows the time zone until the owner picks one explicitly.
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const currency = chosenCurrency ?? business?.currency ?? (timezone ? currencyForTimezone(timezone) : "INR");

  const descriptionOk = description.trim().length >= DESCRIPTION_MIN;
  const emailOk = /\S+@\S+\.\S+/.test(contactEmail);
  const valid = name.trim().length >= 2 && businessType !== "" && descriptionOk && emailOk && timezone !== "";

  const missing: string[] = [];
  if (name.trim().length < 2) missing.push("a business name");
  if (businessType === "") missing.push("an industry");
  if (!descriptionOk) missing.push(`${DESCRIPTION_MIN - description.trim().length} more characters in your description`);
  if (!emailOk) missing.push("a valid contact email");
  if (!timezone) missing.push("your time zone");

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
    <>
    <form id="business-step-form" action={formAction} className="flex flex-col gap-5">
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
          aria-describedby={looksLikeClerkOrganizationDefault(name) ? "business-name-hint" : undefined}
          className={inputClasses}
        />
        {looksLikeClerkOrganizationDefault(name) && (
          <p id="business-name-hint" className="text-xs text-ds-text-muted">Use the name your customers know your business by.</p>
        )}
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
              className={`border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary ${
                businessType === type.value
                  ? "border-ds-primary bg-ds-primary text-ds-primary-on"
                  : "border-ds-border text-ds-text-secondary hover:border-ds-border-strong"
              }`}
            >
              {businessType === type.value ? <Check className="mr-1 inline size-3" aria-hidden /> : null}{type.label}
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
          <span className="text-xs text-ds-text-muted">{descriptionOk ? `${description.trim().length} characters` : `Minimum ${DESCRIPTION_MIN} characters`}</span>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="timezone" className="text-sm font-medium text-ds-text-primary">
            Time zone
          </label>
          <TimezonePicker
            id="timezone"
            name="timezone"
            value={timezone}
            onChange={setChosenTimezone}
            disabled={isPending}
            invalid={Boolean(fieldErrors.timezone)}
            describedBy="timezone-help"
            triggerClassName={inputClasses}
          />
          <p id="timezone-help" className="text-xs text-ds-text-muted">
            {timezoneIsDetected ? "Detected from your browser. " : ""}Your opening hours and appointment times use this.
          </p>
          {fieldErrors.timezone ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.timezone}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className="text-sm font-medium text-ds-text-primary">
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setChosenCurrency(e.target.value)}
            disabled={isPending}
            aria-describedby="currency-help"
            aria-invalid={fieldErrors.currency ? true : undefined}
            className={inputClasses}
          >
            {SUPPORTED_CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <p id="currency-help" className="text-xs text-ds-text-muted">
            Prices you add are shown in this currency.
          </p>
          {fieldErrors.currency ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.currency}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contactPhone" className="text-sm font-medium text-ds-text-primary">
          Contact phone <span className="text-ds-text-muted">Optional</span>
        </label>
        <input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel"
          placeholder="e.g. +91 98765 43210" className={inputClasses}
          value={contactPhone} onChange={(event) => setContactPhone(event.target.value)}
          disabled={isPending} aria-invalid={Boolean(fieldErrors.contactPhone)} />
        {fieldErrors.contactPhone ? <p role="alert" className="text-xs text-ds-danger">{fieldErrors.contactPhone}</p> : null}
      </div>

      {isNew ? (
        <div id="opening-hours" className="scroll-mt-24 border-t border-ds-border pt-4">
          <p className="text-sm font-medium text-ds-text-primary">
            {hoursAccepted ? "Hours selected" : hoursEdited ? "Edited hours" : "Default hours - confirm or edit"}
          </p>
          {timezone && <p className="text-xs text-ds-text-muted">These hours are in {timezone}.</p>}
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-ds-text-primary">
              {summarizeWeeklyHours(week, timezone)} · Edit
            </summary>
            <div className="pt-4">
              <WeeklyHoursFields week={week} disabled={isPending} onChange={(updatedWeek) => {
                setWeek(updatedWeek);
                setHoursEdited(true);
                setHoursAccepted(false);
              }} />
            </div>
          </details>
          <input type="hidden" name="confirmHours" value={String(hoursAccepted || hoursEdited)} />
          {!hoursAccepted && !hoursEdited && (
            <button type="button" onClick={() => setHoursAccepted(true)} disabled={isPending}
              className="mt-2 text-sm font-medium text-ds-text-primary underline">
              These are correct
            </button>
          )}
          {hoursAccepted && <p role="status" className="mt-2 text-xs text-ds-text-muted">Your hours will be confirmed when you continue.</p>}
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span />
        <div className="flex items-center gap-3">
          {!valid ? <span className="text-xs text-ds-text-muted">Add {missing[0]} to continue</span> : null}
          <button type="submit" disabled={isPending || !valid}
            className="ds-btn-label bg-ds-primary px-5 py-2.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary">
            {isPending ? "Saving…" : isNew && hoursEdited ? "Save hours and continue" : "Continue"}
          </button>
        </div>
      </div>
    </form>
      {business ? <HoursSummary hours={hours} timezone={timezone || "UTC"} slaMinutes={business.sla_minutes} useProfileTimezone /> : null}
    </>
  );
}
