"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WidgetLanguage, WidgetPosition } from "@/lib/supabase/types";
import { WIDGET_LANGUAGE_LABELS, SUPPORTED_WIDGET_LANGUAGES } from "@/lib/widget-i18n";
import { updateWidgetBrandingAction, type WidgetBrandingActionState } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const initialState: WidgetBrandingActionState = {};

const inputClasses =
  "rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60";

export function WidgetBrandingForm({
  initialAccentColor,
  initialLogoUrl,
  initialWelcomeText,
  initialWelcomeTextClosed,
  initialCtaText,
  initialPosition,
  initialLanguage,
  canEdit = true,
}: {
  initialAccentColor: string;
  initialLogoUrl: string;
  initialWelcomeText: string;
  initialWelcomeTextClosed: string;
  initialCtaText: string;
  initialPosition: WidgetPosition;
  initialLanguage: WidgetLanguage;
  canEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateWidgetBrandingAction, initialState);
  const reduceMotion = useReducedMotion();

  return (
    <form action={formAction} className="flex w-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">Branding &amp; language</h2>
        <p className="text-sm text-ds-text-secondary">
          Customize how the chat panel looks and greets prospects. Everything here is optional — a
          field left blank falls back to a sensible default.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="accentColor" className="text-sm font-medium text-ds-text-secondary">
            Accent color <span className="text-ds-text-muted">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="accentColor"
              name="accentColor"
              type="text"
              placeholder="#d7f24e"
              pattern="^#[0-9a-fA-F]{6}$"
              defaultValue={initialAccentColor}
              disabled={isPending || !canEdit}
              className={`flex-1 ${inputClasses}`}
            />
            <input
              type="color"
              aria-label="Pick accent color"
              defaultValue={initialAccentColor || "#d7f24e"}
              disabled={isPending || !canEdit}
              onChange={(event) => {
                const input = document.getElementById("accentColor") as HTMLInputElement | null;
                if (input) input.value = event.target.value;
              }}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-ds-sm border border-ds-border bg-transparent disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="logoUrl" className="text-sm font-medium text-ds-text-secondary">
            Logo URL <span className="text-ds-text-muted">(optional)</span>
          </label>
          <input
            id="logoUrl"
            name="logoUrl"
            type="url"
            placeholder="https://example.com/logo.png"
            defaultValue={initialLogoUrl}
            disabled={isPending || !canEdit}
            className={inputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="position" className="text-sm font-medium text-ds-text-secondary">
            Placement
          </label>
          <select
            id="position"
            name="position"
            defaultValue={initialPosition}
            disabled={isPending || !canEdit}
            className={inputClasses}
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="language" className="text-sm font-medium text-ds-text-secondary">
            Language
          </label>
          <select
            id="language"
            name="language"
            defaultValue={initialLanguage}
            disabled={isPending || !canEdit}
            className={inputClasses}
          >
            {SUPPORTED_WIDGET_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {WIDGET_LANGUAGE_LABELS[lang]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ctaText" className="text-sm font-medium text-ds-text-secondary">
          Launcher CTA text <span className="text-ds-text-muted">(optional, e.g. &ldquo;Chat with us&rdquo;)</span>
        </label>
        <input
          id="ctaText"
          name="ctaText"
          type="text"
          maxLength={60}
          placeholder="Chat with us"
          defaultValue={initialCtaText}
          disabled={isPending || !canEdit}
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="welcomeText" className="text-sm font-medium text-ds-text-secondary">
          Welcome greeting (open hours) <span className="text-ds-text-muted">(optional)</span>
        </label>
        <textarea
          id="welcomeText"
          name="welcomeText"
          rows={2}
          maxLength={280}
          defaultValue={initialWelcomeText}
          disabled={isPending || !canEdit}
          className={inputClasses}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="welcomeTextClosed" className="text-sm font-medium text-ds-text-secondary">
          Welcome greeting (outside business hours) <span className="text-ds-text-muted">(optional)</span>
        </label>
        <textarea
          id="welcomeTextClosed"
          name="welcomeTextClosed"
          rows={2}
          maxLength={280}
          defaultValue={initialWelcomeTextClosed}
          disabled={isPending || !canEdit}
          className={inputClasses}
        />
        <p className="text-xs text-ds-text-muted">
          Shown instead of the greeting above when a prospect opens the chat outside your{" "}
          <a href="/dashboard/business-hours" className="underline hover:text-ds-text-secondary">
            configured business hours
          </a>
          . If you haven&apos;t configured business hours, the chat is always treated as open.
        </p>
      </div>

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
            className="text-sm text-ds-success"
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            Widget settings updated.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <button
        type="submit"
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isPending ? "Saving…" : "Save widget settings"}
      </button>
    </form>
  );
}
