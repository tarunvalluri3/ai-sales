"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Code2, Link2 } from "lucide-react";
import type { WidgetLanguage, WidgetPosition } from "@/lib/supabase/types";
import { WIDGET_LANGUAGE_LABELS, SUPPORTED_WIDGET_LANGUAGES } from "@/lib/widget-i18n";
import { updateWidgetBrandingAction, type WidgetBrandingActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { Card, Pill, btnPrimary, helpClass, labelClass, linkAccent } from "../_components/ui";
import { inputClasses } from "./input-classes";
import { WidgetPreview, WidgetStatusStrip } from "./widget-preview";

const initialState: WidgetBrandingActionState = {};

const CTA_MAX = 60;
const GREETING_MAX = 280;

/**
 * The Appearance tab: the branding form on the left and a live preview on
 * the right. Fields that change what the preview shows (accent, logo,
 * placement, language, bubble text, open-hours greeting) are controlled so
 * the preview follows every keystroke; the rest stay uncontrolled. Nothing
 * is saved until "Save widget settings" (which itself only saves a draft).
 */
export function WidgetBrandingForm({
  businessName,
  initialAccentColor,
  initialLogoUrl,
  initialWelcomeText,
  initialWelcomeTextClosed,
  initialCtaText,
  initialPosition,
  initialLanguage,
  initialPrivacyPolicyUrl,
  suggestedQuestions,
  isPublished,
  activeKeyCount,
  canEdit = true,
}: {
  businessName: string;
  initialAccentColor: string;
  initialLogoUrl: string;
  initialWelcomeText: string;
  initialWelcomeTextClosed: string;
  initialCtaText: string;
  initialPosition: WidgetPosition;
  initialLanguage: WidgetLanguage;
  initialPrivacyPolicyUrl: string;
  /** The saved suggested questions, shown in the preview exactly as the widget would. */
  suggestedQuestions: string[];
  isPublished: boolean;
  activeKeyCount: number;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateWidgetBrandingAction, initialState);
  const reduceMotion = useReducedMotion();
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [position, setPosition] = useState<WidgetPosition>(initialPosition);
  const [language, setLanguage] = useState<WidgetLanguage>(initialLanguage);
  const [ctaText, setCtaText] = useState(initialCtaText);
  const [welcomeText, setWelcomeText] = useState(initialWelcomeText);
  const [closedLength, setClosedLength] = useState(initialWelcomeTextClosed.length);
  const disabled = isPending || !canEdit;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Card as="div" padded={false}>
        <form action={formAction} className="flex flex-col gap-5 dx-card-pad">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title text-lg">Branding &amp; language</h2>
            <p className="dx-subtitle">Make the chat experience yours. Anything left blank uses a sensible default.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="accentColor" className={labelClass}>
                Accent color
              </label>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-ds-border-strong bg-ds-surface pr-3 pl-2 focus-within:border-ds-primary">
                <input
                  type="color"
                  aria-label="Pick accent color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : "#dc2626"}
                  onChange={(event) => setAccentColor(event.target.value)}
                  disabled={disabled}
                  className="size-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:opacity-60"
                />
                <input
                  id="accentColor"
                  name="accentColor"
                  type="text"
                  placeholder="#dc2626"
                  pattern="^#[0-9a-fA-F]{6}$"
                  value={accentColor}
                  onChange={(event) => setAccentColor(event.target.value)}
                  disabled={disabled}
                  className="h-full min-h-0 w-full min-w-0 rounded-none border-0 bg-transparent p-0 text-sm text-ds-text-primary placeholder:text-ds-text-faint focus-visible:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="language" className={labelClass}>
                Language
              </label>
              <select
                id="language"
                name="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as WidgetLanguage)}
                disabled={disabled}
                className={inputClasses}
              >
                {SUPPORTED_WIDGET_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {WIDGET_LANGUAGE_LABELS[lang]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="logoUrl" className={labelClass}>
                Logo URL
              </label>
              <div className="relative">
                <Link2 strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ds-text-secondary" aria-hidden="true" />
                <input
                  id="logoUrl"
                  name="logoUrl"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  disabled={disabled}
                  className={`${inputClasses} pl-10`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="position" className={labelClass}>
                Placement
              </label>
              <select
                id="position"
                name="position"
                value={position}
                onChange={(event) => setPosition(event.target.value as WidgetPosition)}
                disabled={disabled}
                className={inputClasses}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="privacyPolicyUrl" className={labelClass}>
              Privacy policy URL
            </label>
            <div className="relative">
              <Link2 strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ds-text-secondary" aria-hidden="true" />
              <input
                id="privacyPolicyUrl"
                name="privacyPolicyUrl"
                type="url"
                placeholder="https://example.com/privacy"
                defaultValue={initialPrivacyPolicyUrl}
                aria-describedby="privacyPolicyUrl-hint"
                disabled={disabled}
                className={`${inputClasses} pl-10`}
              />
            </div>
            <p id="privacyPolicyUrl-hint" className={helpClass}>
              Linked from the contact consent checkbox. It should be your own policy and start with https://. Left blank, the
              checkbox links to Waves AI Pilot&apos;s policy, which describes our data handling rather than yours.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ctaText" className={labelClass}>
              Chat bubble text
            </label>
            <div className="relative">
              <input
                id="ctaText"
                name="ctaText"
                type="text"
                maxLength={CTA_MAX}
                placeholder="Chat with us"
                value={ctaText}
                onChange={(event) => setCtaText(event.target.value)}
                disabled={disabled}
                className={`${inputClasses} pr-16`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs tabular-nums text-ds-text-secondary" aria-hidden="true">
                {ctaText.length}/{CTA_MAX}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-ds-border pt-5">
            <h3 className="text-base font-medium text-ds-text-primary">Welcome messages</h3>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="welcomeText" className={labelClass}>
                Open-hours greeting
              </label>
              <textarea
                id="welcomeText"
                name="welcomeText"
                rows={2}
                maxLength={GREETING_MAX}
                value={welcomeText}
                onChange={(event) => setWelcomeText(event.target.value)}
                disabled={disabled}
                className={`${inputClasses} h-auto py-2.5 leading-relaxed`}
              />
              <span className="self-end text-xs tabular-nums text-ds-text-secondary" aria-hidden="true">
                {welcomeText.length}/{GREETING_MAX}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="welcomeTextClosed" className={labelClass}>
                Outside-business-hours greeting
              </label>
              <textarea
                id="welcomeTextClosed"
                name="welcomeTextClosed"
                rows={2}
                maxLength={GREETING_MAX}
                defaultValue={initialWelcomeTextClosed}
                onChange={(event) => setClosedLength(event.target.value.length)}
                disabled={disabled}
                className={`${inputClasses} h-auto py-2.5 leading-relaxed`}
              />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className={helpClass}>
                  Your schedule is set in{" "}
                  <Link href="/dashboard/business-hours" className={`${linkAccent} text-xs`}>
                    Business Hours
                    <ArrowUpRight strokeWidth={1.75} className="size-3.5" aria-hidden="true" />
                  </Link>
                  . Without business hours, the chat is always treated as open.
                </p>
                <span className="text-xs tabular-nums text-ds-text-secondary" aria-hidden="true">
                  {closedLength}/{GREETING_MAX}
                </span>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {state.error ? (
              <motion.p
                key="error"
                role="alert"
                className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger"
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
                className="rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success"
                initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                Widget settings updated.
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={disabled} title={canEdit ? undefined : ROLE_DENIED_TITLE} className={`${btnPrimary} min-w-64`}>
              {isPending ? "Saving…" : "Save widget settings"}
            </button>
            <span className="text-sm text-ds-text-secondary">Saves as draft</span>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-4 xl:sticky xl:top-4">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-3">
              <h2 className="dx-title">Widget preview</h2>
              <Pill tone="amber">Draft</Pill>
            </div>
            <p className="dx-subtitle">Preview of your current appearance settings.</p>
          </div>
          <WidgetPreview
            showPage
            businessName={businessName}
            accentColor={accentColor}
            logoUrl={logoUrl}
            greeting={welcomeText}
            ctaText={ctaText}
            questions={suggestedQuestions}
            language={language}
            position={position}
          />
          <Link href="/dashboard/widget-settings?tab=install" className={`${linkAccent} self-start`}>
            <Code2 strokeWidth={1.75} className="size-4" aria-hidden="true" />
            Manage installation &amp; keys
            <ArrowUpRight strokeWidth={1.75} className="size-4" aria-hidden="true" />
          </Link>
        </Card>
        <WidgetStatusStrip
          isPublished={isPublished}
          activeKeyCount={activeKeyCount}
          note="Your live widget uses the last published settings. Publish saved changes from the dashboard header."
        />
      </div>
    </div>
  );
}
