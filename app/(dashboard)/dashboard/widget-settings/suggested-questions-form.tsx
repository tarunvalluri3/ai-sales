"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, Info, Plus, Sparkles, X } from "lucide-react";
import type { WidgetLanguage } from "@/lib/supabase/types";
import { generateSuggestedQuestionsAction, saveSuggestedQuestionsAction } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";
import { Card, Pill, btnGhost, btnIcon, btnPrimary } from "../_components/ui";
import { inputClasses } from "./input-classes";
import { WidgetPreview, WidgetStatusStrip } from "./widget-preview";

const MAX_QUESTIONS = 6;

const MOVE_BUTTON =
  "flex h-6 w-8 shrink-0 items-center justify-center rounded-md border border-ds-border-strong bg-ds-surface text-ds-text-primary transition-colors hover:bg-ds-surface-soft disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary pointer-coarse:h-9 pointer-coarse:w-11";

/**
 * The Suggested questions tab (Phase 25e): "Generate with AI" proposes
 * questions grounded in the business's own products/services/FAQs
 * (lib/widget-suggested-questions.ts); the owner can then edit, reorder,
 * add or remove any before saving. Local draft state only -- nothing is
 * stored until Save is pressed, and the preview on the right shows this
 * draft, not what is live. `initialQuestions` seeds it from what is saved.
 */
export function SuggestedQuestionsForm({
  initialQuestions,
  businessName,
  accentColor,
  logoUrl,
  greeting,
  language,
  isPublished,
  activeKeyCount,
  canEdit = true,
}: {
  initialQuestions: string[];
  businessName: string;
  accentColor: string;
  logoUrl: string;
  greeting: string;
  language: WidgetLanguage;
  isPublished: boolean;
  activeKeyCount: number;
  canEdit?: boolean;
}) {
  const [questions, setQuestions] = useState<string[]>(initialQuestions);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const reduceMotion = useReducedMotion();

  function handleGenerate() {
    setError(null);
    setSuccess(false);
    startGenerate(async () => {
      const result = await generateSuggestedQuestionsAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setQuestions((result.questions ?? []).slice(0, MAX_QUESTIONS));
    });
  }

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((question, i) => (i === index ? value : question)));
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function addQuestion() {
    setSuccess(false);
    setQuestions((prev) => (prev.length >= MAX_QUESTIONS ? prev : [...prev, ""]));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSave() {
    setError(null);
    setSuccess(false);
    startSave(async () => {
      // A row added with "Add question" and left empty is not a question.
      const cleaned = questions.map((question) => question.trim()).filter(Boolean);
      const result = await saveSuggestedQuestionsAction(cleaned);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQuestions(cleaned);
      setSuccess(true);
    });
  }

  const isPending = isGenerating || isSaving;
  const disabled = isPending || !canEdit;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="dx-title">Suggested questions</h2>
            <p className="dx-subtitle">Visitors can tap a question to start chatting.</p>
          </div>
          <button type="button" onClick={handleGenerate} disabled={disabled} title={canEdit ? undefined : ROLE_DENIED_TITLE} className={btnGhost}>
            <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
            {isGenerating ? "Generating…" : questions.length > 0 ? "Regenerate with AI" : "Generate with AI"}
          </button>
        </div>

        <p className="flex items-center gap-3 text-sm text-ds-text-secondary">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary">
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          Generated from your products, services and FAQs. Review and edit before publishing.
        </p>

        {questions.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <li key={index} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ds-surface-soft text-sm font-medium text-ds-text-primary">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-label={`Move question ${index + 1} up`}
                    disabled={disabled || index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    className={MOVE_BUTTON}
                  >
                    <ChevronUp strokeWidth={1.75} className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move question ${index + 1} down`}
                    disabled={disabled || index === questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    className={MOVE_BUTTON}
                  >
                    <ChevronDown strokeWidth={1.75} className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <input
                  type="text"
                  value={question}
                  maxLength={120}
                  disabled={disabled}
                  onChange={(event) => updateQuestion(index, event.target.value)}
                  aria-label={`Suggested question ${index + 1}`}
                  className={`${inputClasses} h-10 flex-1 text-base`}
                />
                <button
                  type="button"
                  aria-label={`Remove question ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeQuestion(index)}
                  className={btnIcon}
                >
                  <X strokeWidth={1.75} className="size-5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-ds-surface-soft px-4 py-6 text-center">
            <p className="text-sm font-medium text-ds-text-primary">No suggested questions yet</p>
            <p className="max-w-sm text-sm text-ds-text-secondary">
              Generate some from your catalog, add your own, or leave this empty to show no chips on the greeting screen.
            </p>
          </div>
        )}

        <p className="text-sm text-ds-text-secondary">
          Up to 120 characters · {questions.length} of {MAX_QUESTIONS} questions.
        </p>

        <button
          type="button"
          onClick={addQuestion}
          disabled={disabled || questions.length >= MAX_QUESTIONS}
          title={canEdit ? undefined : ROLE_DENIED_TITLE}
          className={`${btnGhost} self-start`}
        >
          <Plus strokeWidth={1.75} className="size-5" aria-hidden="true" />
          Add question
        </button>

        <p className="flex items-center gap-3 border-y border-ds-border py-3 text-sm text-ds-text-secondary">
          <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Questions appear in the same order in your widget.
        </p>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              role="alert"
              className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger"
              initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {error}
            </motion.p>
          ) : null}
          {success ? (
            <motion.p
              key="success"
              role="status"
              className="rounded-xl bg-ds-success-bg px-3 py-2 text-sm text-ds-success"
              initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Suggested questions saved.
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={handleSave} disabled={disabled} title={canEdit ? undefined : ROLE_DENIED_TITLE} className={`${btnPrimary} min-w-64`}>
            {isSaving ? "Saving…" : "Save suggested questions"}
          </button>
          <span className="text-sm text-ds-text-secondary">Saves as a draft</span>
        </div>
      </Card>

      <div className="flex flex-col gap-4 xl:sticky xl:top-4">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-3">
              <h2 className="dx-title">Widget preview</h2>
              <Pill tone="amber">Draft</Pill>
            </div>
            <p className="dx-subtitle">See how visitors begin a conversation.</p>
          </div>
          <WidgetPreview
            businessName={businessName}
            accentColor={accentColor}
            logoUrl={logoUrl}
            greeting={greeting}
            questions={questions}
            language={language}
          />
          <p className="text-sm text-ds-text-secondary">Preview shows your draft questions.</p>
        </Card>
        <WidgetStatusStrip
          isPublished={isPublished}
          activeKeyCount={activeKeyCount}
          note="Customers see the published version until you publish your changes."
        />
      </div>
    </div>
  );
}
