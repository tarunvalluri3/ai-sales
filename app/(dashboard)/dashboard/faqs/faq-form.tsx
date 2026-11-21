"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { draftFaqAnswerAction, type FaqFormState } from "./actions";

const initialState: FaqFormState = {};

const inputClasses =
  "w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-faint transition-colors disabled:opacity-60";
const labelClasses = "text-sm font-medium text-ds-text-primary";

export function FaqForm({
  action,
  id,
  initialQuestion = "",
  initialAnswer = "",
  suggestedQuestion,
  submitLabel,
  pendingLabel,
  onSuccess,
}: {
  action: (prevState: FaqFormState, formData: FormData) => Promise<FaqFormState>;
  id?: string;
  initialQuestion?: string;
  initialAnswer?: string;
  suggestedQuestion?: { text: string };
  submitLabel: string;
  pendingLabel: string;
  /** Called once after a successful submit, in addition to the existing reset-on-add behavior -- lets a caller editing in place (no navigation to a dedicated edit page) know when to exit edit mode. */
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const questionRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [questionText, setQuestionText] = useState(initialQuestion);
  const [draftPending, startDraft] = useTransition();
  const [draftFeedback, setDraftFeedback] = useState<{ text: string; error?: boolean }>();

  function requestDraft() {
    setDraftFeedback(undefined);
    startDraft(async () => {
      try {
        const result = await draftFaqAnswerAction(questionText);
        const answer = formRef.current?.elements.namedItem("answer");
        if (result.answer && answer instanceof HTMLTextAreaElement) {
          answer.value = result.answer;
          setDraftFeedback({ text: "Draft — check before saving" });
        } else {
          setDraftFeedback({ text: result.hint ?? result.error ?? "Could not draft an answer.", error: Boolean(result.error) });
        }
      } catch {
        setDraftFeedback({ text: "Could not draft an answer. Try again or write it yourself.", error: true });
      }
    });
  }

  const successHandler = useRef(onSuccess);
  useEffect(() => { successHandler.current = onSuccess; }, [onSuccess]);

  useEffect(() => {
    const input = questionRef.current;
    const sync = () => { setQuestionText(input?.value ?? ""); setDraftFeedback(undefined); };
    input?.addEventListener("faq-question-changed", sync);
    return () => input?.removeEventListener("faq-question-changed", sync);
  }, []);

  useEffect(() => {
    if (suggestedQuestion && questionRef.current && !questionRef.current.disabled) {
      questionRef.current.value = suggestedQuestion.text;
      questionRef.current.dispatchEvent(new Event("faq-question-changed"));
      questionRef.current.focus();
    }
  }, [suggestedQuestion]);

  useEffect(() => {
    if (state.values && formRef.current) {
      const question = questionRef.current;
      const answer = formRef.current.elements.namedItem("answer");
      if (question) {
        question.value = state.values.question;
        question.dispatchEvent(new Event("faq-question-changed"));
      }
      if (answer instanceof HTMLTextAreaElement) answer.value = state.values.answer;
    }
    if (state.success) {
      if (!id) {
        formRef.current?.reset();
        questionRef.current?.dispatchEvent(new Event("faq-question-changed"));
      }
      successHandler.current?.();
    }
  }, [state, id]);

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3.5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="question" className={labelClasses}>
          Question <span className="text-ds-danger">*</span>
        </label>
        <input
          ref={questionRef}
          id="question"
          name="question"
          type="text"
          required
          minLength={1}
          maxLength={300}
          placeholder="e.g. What happens after I request a quote?"
          defaultValue={initialQuestion}
          onChange={(event) => { setQuestionText(event.currentTarget.value); setDraftFeedback(undefined); }}
          disabled={isPending || draftPending}
          className={inputClasses}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="answer" className={labelClasses}>
          Answer <span className="text-ds-danger">*</span>
        </label>
        <textarea
          id="answer"
          name="answer"
          rows={6}
          placeholder="Give a clear, complete answer using information approved by your business."
          required
          minLength={1}
          maxLength={2000}
          defaultValue={initialAnswer}
          onChange={() => setDraftFeedback(undefined)}
          disabled={isPending || draftPending}
          className={`${inputClasses} leading-relaxed`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!questionText.trim() || isPending || draftPending} onClick={requestDraft}
          className="rounded border border-ds-border px-3 py-2 text-sm disabled:opacity-60">
          {draftPending ? "Drafting…" : "Draft an answer from my info"}
        </button>
        {draftFeedback && <p role={draftFeedback.error ? "alert" : "status"} className="text-sm text-ds-text-secondary">{draftFeedback.text}</p>}
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-ds-danger-bg px-3 py-2 text-sm text-ds-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending || draftPending}
        className="ds-btn-label inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-ds-primary px-4 text-sm text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {id ? null : <Plus strokeWidth={1.75} className="size-4" aria-hidden="true" />}
        {isPending ? pendingLabel : submitLabel}
      </button>
      <p className="text-center text-sm text-ds-text-secondary">Saves as a draft</p>
    </form>
  );
}
