"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { generateSuggestedQuestionsAction, saveSuggestedQuestionsAction } from "./actions";
import { ROLE_DENIED_TITLE } from "../_components/delete-button";

const MAX_QUESTIONS = 6;

/**
 * Widget Settings' "prefilled questions" card (Phase 25e): a business
 * owner clicks "Generate with AI" to get candidate questions grounded in
 * their own products/services/FAQs (lib/widget-suggested-questions.ts),
 * then can edit, reorder, or remove any of them before saving -- nothing
 * shows on the live widget until Save is pressed. Local draft state only;
 * `initialQuestions` seeds it from what's already saved.
 */
export function SuggestedQuestionsForm({
  initialQuestions,
  canEdit = true,
}: {
  initialQuestions: string[];
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
      const result = await saveSuggestedQuestionsAction(questions);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  const isPending = isGenerating || isSaving;

  return (
    <div className="flex w-full flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">Prefilled questions</h2>
        <p className="text-sm text-ds-text-secondary">
          Clickable question suggestions shown on your widget&apos;s greeting screen, before a
          prospect types anything. Generate suggestions from your products, services, and FAQs,
          then edit or remove any before saving — nothing changes on your live widget until you
          save.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-sm border border-ds-border px-4 py-2 text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-elevated disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isGenerating ? "Generating…" : questions.length > 0 ? "Regenerate with AI" : "Generate with AI"}
      </button>

      {questions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {questions.map((question, index) => (
            <li key={index} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={isPending || !canEdit || index === 0}
                  onClick={() => moveQuestion(index, -1)}
                  className="flex h-4 w-5 items-center justify-center text-ds-text-muted transition-colors hover:text-ds-text-primary disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={isPending || !canEdit || index === questions.length - 1}
                  onClick={() => moveQuestion(index, 1)}
                  className="flex h-4 w-5 items-center justify-center text-ds-text-muted transition-colors hover:text-ds-text-primary disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <input
                type="text"
                value={question}
                maxLength={120}
                disabled={isPending || !canEdit}
                onChange={(event) => updateQuestion(index, event.target.value)}
                aria-label={`Suggested question ${index + 1}`}
                className="flex-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                aria-label="Remove question"
                disabled={isPending || !canEdit}
                onClick={() => removeQuestion(index)}
                className="shrink-0 rounded-ds-sm px-2 py-2 text-ds-text-muted transition-colors hover:bg-ds-surface-elevated hover:text-ds-danger disabled:opacity-60"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ds-text-muted">
          No suggested questions yet — generate some from your catalog, or leave this off to show
          no chips on the greeting screen.
        </p>
      )}

      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            role="alert"
            className="text-sm text-ds-danger"
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
            className="text-sm text-ds-success"
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            Suggested questions saved.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !canEdit}
        title={canEdit ? undefined : ROLE_DENIED_TITLE}
        className="self-start rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        {isSaving ? "Saving…" : "Save suggested questions"}
      </button>
    </div>
  );
}
