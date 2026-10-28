"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@/lib/supabase/types";
import { SUPPORTED_WIDGET_LANGUAGES, WIDGET_LANGUAGE_LABELS } from "@/lib/widget-i18n";
import { updateWidgetBrandingAction, type WidgetBrandingActionState } from "../../../dashboard/widget-settings/actions";
import { advanceOnboarding } from "../../actions";
import { useOnboardingPreview } from "../preview-context";

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

const TONES: { key: "friendly" | "professional" | "concise"; label: string; example: string }[] = [
  { key: "friendly", label: "Friendly", example: "Hey there! Happy to help you find the right fit 😊" },
  { key: "professional", label: "Professional", example: "Good day. I'd be glad to assist with your inquiry." },
  { key: "concise", label: "Concise", example: "Hi — how can I help?" },
];

const initialState: WidgetBrandingActionState = {};

/**
 * Stage 3: "Personality". There is no persisted `tone` column on
 * `businesses` -- adding one would be a schema change out of this UI
 * task's scope. Picking a tone card instead reshapes the greeting text
 * it prefills; the only field actually saved is the greeting itself
 * (`widget_welcome_text`) plus the widget's language, both via the real
 * `updateWidgetBrandingAction` (every other branding field is passed
 * through unchanged via hidden inputs, so this never clobbers settings
 * configured elsewhere).
 */
export function PersonaStep({ business }: { business: Business }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updateWidgetBrandingAction, initialState);
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

  const valid = greeting.trim().length > 0;

  useEffect(() => {
    if (!state.success) return;
    void advanceOnboarding("channels").then((result) => {
      if (result.ok) router.push("/onboarding?step=channels");
    });
    // Only react to a fresh success from the branding save itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="accentColor" value={business.widget_accent_color ?? ""} />
      <input type="hidden" name="logoUrl" value={business.widget_logo_url ?? ""} />
      <input type="hidden" name="welcomeTextClosed" value={business.widget_welcome_text_closed ?? ""} />
      <input type="hidden" name="ctaText" value={business.widget_cta_text ?? ""} />
      <input type="hidden" name="position" value={business.widget_position} />
      <input type="hidden" name="privacyPolicyUrl" value={business.privacy_policy_url ?? ""} />
      <input type="hidden" name="welcomeText" value={greeting} />
      <input type="hidden" name="language" value={language} />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ds-text-primary">Agent name</span>
        <p className="rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-secondary">
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
              className={`flex flex-col gap-1 rounded-ds-md border p-3 text-left transition-colors ${
                tone === t.key ? "border-ds-accent bg-ds-accent-soft-bg" : "border-ds-border hover:border-ds-border-strong"
              }`}
            >
              <span className="text-sm font-semibold text-ds-text-primary">{t.label}</span>
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
            className="rounded-ds-sm bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
          >
            {isPending ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </form>
  );
}
