"use client";

import { DEFAULT_WIDGET_PRIMARY, sanitizeAccentColor } from "@/lib/widget-colors";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@/lib/supabase/types";
import { SUPPORTED_WIDGET_LANGUAGES, WIDGET_LANGUAGE_LABELS } from "@/lib/widget-i18n";
import { updateAiCapabilitiesAction, updateWidgetBrandingAction, type WidgetBrandingActionState } from "../../../dashboard/widget-settings/actions";
import { advanceOnboarding } from "../../actions";
import { useOnboardingPreview } from "../preview-context";

const inputClasses =
  "border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

const TONES: { key: "friendly" | "professional" | "concise"; label: string; example: string }[] = [
  { key: "friendly", label: "Friendly", example: "Hey there! Happy to help you find the right fit 😊" },
  { key: "professional", label: "Professional", example: "Good day. I'd be glad to assist with your inquiry." },
  { key: "concise", label: "Concise", example: "Hi — how can I help?" },
];

const SWATCHES = [DEFAULT_WIDGET_PRIMARY, "#dc2626", "#c2410c", "#a16207", "#15803d", "#0f766e", "#2563eb", "#7e22ce"];

const initialState: WidgetBrandingActionState = {};

/** Tone presets seed the greeting. Branding and capabilities use the dashboard save actions. */
export function PersonaStep({ business, hoursSummary }: { business: Business; hoursSummary: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(savePersona, initialState);
  const { update } = useOnboardingPreview();

  const [tone, setTone] = useState<"friendly" | "professional" | "concise">("friendly");
  const defaultGreeting = (toneKey: typeof tone) => {
    const name = business.name || "us";
    if (toneKey === "professional") return `Welcome to ${name}. How may I assist you today?`;
    if (toneKey === "concise") return `Hi! How can I help?`;
    return `Hey! Welcome to ${name} 👋 How can I help today?`;
  };
  const [greeting, setGreeting] = useState(business.widget_welcome_text || defaultGreeting("friendly"));
  const [language, setLanguage] = useState(business.widget_language);

  const [accent, setAccent] = useState(business.widget_accent_color ?? DEFAULT_WIDGET_PRIMARY);
  const [appointments, setAppointments] = useState(business.appointments_enabled);
  const [recommendations, setRecommendations] = useState(business.recommend_products_enabled);
  const accentError = !sanitizeAccentColor(accent) ? "Enter a six-digit hex colour, like #3f3f46." : null;
  const valid = greeting.trim().length > 0 && !accentError;

  function changeAccent(value: string) {
    setAccent(value);
    update({ accent: sanitizeAccentColor(value) });
  }

  async function savePersona(previous: WidgetBrandingActionState, form: FormData): Promise<WidgetBrandingActionState> {
    const branding = await updateWidgetBrandingAction(previous, form);
    if (!branding.success) return branding;
    const capabilities = await updateAiCapabilitiesAction({}, form);
    if (!capabilities.success) return capabilities;
    const next = await advanceOnboarding("channels");
    if (!next.ok) return { error: next.error };
    router.push("/onboarding?step=channels");
    return { success: true };
  }


  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="appointmentSlotMinutes" value={business.appointment_slot_minutes} />
      <input type="hidden" name="logoUrl" value={business.widget_logo_url ?? ""} />
      <input type="hidden" name="welcomeTextClosed" value={business.widget_welcome_text_closed ?? ""} />
      <input type="hidden" name="ctaText" value={business.widget_cta_text ?? ""} />
      <input type="hidden" name="position" value={business.widget_position} />
      <input type="hidden" name="privacyPolicyUrl" value={business.privacy_policy_url ?? ""} />
      <input type="hidden" name="welcomeText" value={greeting} />
      <input type="hidden" name="language" value={language} />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ds-text-primary">Agent name</span>
        <p className="border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-secondary">
          {business.name}
        </p>
        <p className="text-xs text-ds-text-muted">
          Your agent introduces itself as your business. Change the name itself from &ldquo;Your business&rdquo;.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ds-text-primary">Tone</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {TONES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTone(t.key);
                const next = defaultGreeting(t.key);
                setGreeting(next);
                update({ greeting: next });
              }}
              aria-pressed={tone === t.key}
              className={`flex flex-col gap-1 border p-3 text-left transition-colors ${
                tone === t.key ? "border-ds-text-primary bg-ds-surface-raised" : "border-ds-border hover:border-ds-border-strong"
              }`}
            >
              <span className="text-sm font-medium text-ds-text-primary">{t.label}</span>
              <span className="text-xs text-ds-text-secondary">{t.example}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="greeting" className="text-sm font-medium text-ds-text-primary">
          Greeting
        </label>
        <textarea
          id="greeting"
          rows={2}
          maxLength={280}
          value={greeting}
          onChange={(e) => {
            setGreeting(e.target.value);
            update({ greeting: e.target.value });
          }}
          disabled={isPending}
          autoFocus
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="widget-language" className="text-sm font-medium text-ds-text-primary">
          Language
        </label>
        <select
          id="widget-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as typeof language)}
          disabled={isPending}
          className={inputClasses}
        >
          {SUPPORTED_WIDGET_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {WIDGET_LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>
      </div>

      <fieldset disabled={isPending} className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ds-text-primary">Brand colour</legend>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((colour) => (
            <button key={colour} type="button" aria-label={colour} aria-pressed={accent.toLowerCase() === colour}
              onClick={() => changeAccent(colour)} style={{ backgroundColor: colour }}
              className="size-8 rounded-full border border-ds-border aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-ds-text-primary" />
          ))}
        </div>
        <label htmlFor="accentColor" className="text-xs text-ds-text-muted">Hex colour</label>
        <input id="accentColor" name="accentColor" className={inputClasses} value={accent}
          onChange={(event) => changeAccent(event.target.value)} aria-invalid={Boolean(accentError)} maxLength={7} />
        {accentError ? <p role="alert" className="text-xs text-ds-danger">{accentError}</p> : null}
      </fieldset>

      <fieldset disabled={isPending} className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ds-text-primary">Capabilities</legend>
        <label className="flex items-start gap-2 text-sm text-ds-text-primary">
          <input type="checkbox" name="appointmentsEnabled" checked={appointments} onChange={(event) => setAppointments(event.target.checked)} className="mt-1 accent-ds-accent" />
          <span>Book appointments
            <span className="block text-xs text-ds-text-muted">Offer available times and take appointment requests.</span>
            <span className="block text-xs text-ds-text-muted">Uses your business hours: {hoursSummary}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ds-text-primary">
          <input type="checkbox" name="recommendProductsEnabled" checked={recommendations} onChange={(event) => setRecommendations(event.target.checked)} className="mt-1 accent-ds-accent" />
          <span>Recommend products &amp; services
            <span className="block text-xs text-ds-text-muted">Suggest matching offerings from your catalog.</span>
          </span>
        </label>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/onboarding?step=faqs")}
          className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
        >
          Back
        </button>
        <div className="flex items-center gap-3">
          {!valid ? <span className="text-xs text-ds-text-muted">Add a greeting to continue</span> : null}
          <button
            type="submit"
            disabled={isPending || !valid}
            className="ds-btn-label bg-ds-primary px-5 py-2.5 text-sm font-medium text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </form>
  );
}
