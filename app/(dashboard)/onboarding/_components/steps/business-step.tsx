"use client";

import { defaultWeeklyHours } from "@/lib/business-hours-defaults";
import { summarizeWeeklyHours } from "@/lib/business-hours-summary";
import { WeeklyHoursFields } from "../../../dashboard/business-hours/weekly-hours-fields";
import { HoursSummary } from "../hours-summary";
import { Check } from "lucide-react";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { BUSINESS_TYPES, businessContactEmailRequiredSchema, businessDescriptionSchema, businessNameSchema, businessTypeSchema, looksLikeClerkOrganizationDefault } from "@/lib/schemas/business";
import { DESCRIPTION_MIN_LENGTH, previewProfileReadiness, type ReadinessItem } from "@/lib/onboarding-readiness";
import { detectBrowserTimezone } from "@/lib/timezones";
import { SUPPORTED_CURRENCIES, currencyForTimezone } from "@/lib/currency";
import { TimezonePicker } from "../../../dashboard/_components/timezone-picker";
import type { Business, BusinessHours } from "@/lib/supabase/types";
import { createBusiness, saveBusinessStepAction, type CreateBusinessState } from "../../actions";
import type { ProfileFormState } from "../../../dashboard/profile/actions";
import { useOnboardingPreview } from "../preview-context";
import { Card, CardHeader, btnGhost, inputClass, textareaClass } from "../../../dashboard/_components/ui";
import { WizardActions, WizardContinue } from "../wizard-actions";

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

export function BusinessStep({ business, initialName = "", initialEmail = "", hours = [], readinessItems }: {
  business: Business | null;
  initialName?: string;
  initialEmail?: string;
  hours?: BusinessHours[];
  readinessItems: ReadinessItem[];
}) {
  const isNew = business == null;
  const [createState, createFormAction, createPending] = useActionState(createBusiness, createInitialState);
  const [updateState, updateFormAction, updatePending] = useActionState(
    saveBusinessStepAction,
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

  const nameOk = businessNameSchema.safeParse(name).success;
  const industry = businessTypeSchema.safeParse(businessType);
  const validIndustry = industry.success ? industry.data : "";
  const descriptionOk = description.trim().length >= DESCRIPTION_MIN_LENGTH && businessDescriptionSchema.safeParse(description).success;
  const emailOk = businessContactEmailRequiredSchema.safeParse(contactEmail).success;
  const valid = nameOk && validIndustry !== "" && descriptionOk && emailOk && timezone !== "";

  useEffect(() => {
    update({
      businessName: name,
      description,
      ...previewProfileReadiness(readinessItems, { name: nameOk, businessType: validIndustry, description: descriptionOk, contactEmail: emailOk }),
    });
  }, [update, name, description, readinessItems, nameOk, validIndustry, descriptionOk, emailOk]);

  const missing: string[] = [];
  if (!nameOk) missing.push("a business name");
  if (!validIndustry) missing.push("an industry");
  if (!descriptionOk) missing.push(description.trim().length < DESCRIPTION_MIN_LENGTH
    ? `${DESCRIPTION_MIN_LENGTH - description.trim().length} more characters in your description`
    : "a description of at most 500 characters");
  if (!emailOk) missing.push("a valid contact email");
  if (!timezone) missing.push("your time zone");

  const formAction = isNew ? createFormAction : updateFormAction;
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-6">
    <form id="business-step-form" action={formAction} className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
      <CardHeader title="Business profile" description="Give your agent the details it can use to introduce your business." />
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
          autoComplete="organization"
          placeholder="e.g. Glow Studio"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={[looksLikeClerkOrganizationDefault(name) && "business-name-hint", fieldErrors.name && "business-name-error"].filter(Boolean).join(" ") || undefined}
          className={inputClass}
        />
        {looksLikeClerkOrganizationDefault(name) && (
          <p id="business-name-hint" className="text-xs text-ds-text-muted">Use the name your customers know your business by.</p>
        )}
        {fieldErrors.name ? <p id="business-name-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.name}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="industry-label" className="text-sm font-medium text-ds-text-primary">Industry</span>
        <div role="group" aria-labelledby="industry-label" aria-describedby={fieldErrors.businessType ? "industry-error" : undefined} className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setBusinessType(type.value)}
              aria-pressed={businessType === type.value}
              disabled={isPending}
              className={`min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                businessType === type.value
                  ? "border-ds-primary bg-ds-lime-soft text-ds-text-primary"
                  : "border-ds-border text-ds-text-secondary hover:border-ds-border-strong"
              }`}
            >
              {businessType === type.value ? <Check className="mr-1 inline size-3" aria-hidden /> : null}{type.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="businessType" value={businessType} />
        {fieldErrors.businessType ? (
          <p id="industry-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.businessType}</p>
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
          aria-describedby={fieldErrors.website ? "business-website-error" : undefined}
          className={inputClass}
        />
        {fieldErrors.website ? <p id="business-website-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.website}</p> : null}
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
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? "description-help description-error" : "description-help"}
          className={textareaClass}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="description-help" className="text-xs text-ds-text-muted">
            What you sell, where you are based, and who you serve.
          </p>
          <span className="text-xs text-ds-text-muted">{descriptionOk ? `${description.trim().length} characters` : `Minimum ${DESCRIPTION_MIN_LENGTH} characters`}</span>
        </div>
        {fieldErrors.description ? (
          <p id="description-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.description}</p>
        ) : null}
      </div>
      </Card>

      <Card className="flex flex-col gap-4">
      <CardHeader title="Contact and regional settings" description="Set where alerts go and how the agent presents times and prices." />
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
          aria-describedby={fieldErrors.contactEmail ? "contactEmail-help contact-email-error" : "contactEmail-help"}
          aria-invalid={fieldErrors.contactEmail ? true : undefined}
          className={inputClass}
        />
        <p id="contactEmail-help" className="text-xs text-ds-text-muted">
          Lead, appointment and handoff alerts go here.
        </p>
        {fieldErrors.contactEmail ? (
          <p id="contact-email-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.contactEmail}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
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
            describedBy={fieldErrors.timezone ? "timezone-help timezone-error" : "timezone-help"}
            triggerClassName={inputClass}
          />
          <p id="timezone-help" className="text-xs text-ds-text-muted">
            {timezoneIsDetected ? "Detected from your browser. " : ""}Your opening hours and appointment times use this.
          </p>
          {fieldErrors.timezone ? <p id="timezone-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.timezone}</p> : null}
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
            aria-describedby={fieldErrors.currency ? "currency-help currency-error" : "currency-help"}
            aria-invalid={fieldErrors.currency ? true : undefined}
            className={inputClass}
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
          {fieldErrors.currency ? <p id="currency-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.currency}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contactPhone" className="text-sm font-medium text-ds-text-primary">
          Contact phone <span className="text-ds-text-muted">Optional</span>
        </label>
        <input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel"
          placeholder="e.g. +91 98765 43210" className={inputClass}
          value={contactPhone} onChange={(event) => setContactPhone(event.target.value)}
          disabled={isPending} aria-invalid={Boolean(fieldErrors.contactPhone)}
          aria-describedby={fieldErrors.contactPhone ? "contact-phone-error" : undefined} />
        {fieldErrors.contactPhone ? <p id="contact-phone-error" role="alert" className="text-xs text-ds-danger">{fieldErrors.contactPhone}</p> : null}
      </div>
      </Card>

      {isNew ? (
        <div id="opening-hours" className="dx-card dx-card-pad scroll-mt-24">
          <CardHeader title="Opening hours" />
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
              className={btnGhost + " mt-3 min-h-11"}>
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

    </form>
      {business ? <HoursSummary hours={hours} timezone={timezone || "UTC"} slaMinutes={business.sla_minutes} useProfileTimezone /> : null}
      <WizardActions>
        <WizardContinue type="submit" form="business-step-form" pending={isPending} disabled={!valid}
          reason={valid ? undefined : "Add " + missing[0] + " to continue"}
          label={isNew && hoursEdited ? "Save hours and continue" : "Continue"} />
      </WizardActions>
    </div>
  );
}
