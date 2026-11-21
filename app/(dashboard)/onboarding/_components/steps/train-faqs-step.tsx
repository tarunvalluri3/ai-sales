"use client";

import { WizardActions, WizardContinue } from "../wizard-actions";
import { Check } from "lucide-react";
import { Card, CardHeader } from "../../../dashboard/_components/ui";
import { useToast } from "../../../dashboard/_components/toast";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { Faq, IngestionStatus } from "@/lib/supabase/types";
import { FAQ_QUESTION_MIN_LENGTH, FAQ_ANSWER_MIN_LENGTH } from "@/lib/onboarding-readiness";
import { FaqForm } from "../../../dashboard/faqs/faq-form";
import { FaqsList, type FaqReadinessStatus } from "../../../dashboard/faqs/faqs-list";
import { createFaqAction, updateFaqInPlaceAction, deleteFaqAction } from "../../../dashboard/faqs/actions";
import { advanceOnboarding } from "../../actions";
import { useOnboardingPreview } from "../preview-context";

const MIN_FAQS = 3;
const POLL_INTERVAL_MS = 3000;

/**
 * Generic question prompts, not fabricated answers -- the business still
 * writes every answer itself. No existing Gemini "draft an FAQ answer"
 * call was found in this codebase (grepped for one), so per the brief's
 * own fallback, these only prefill the question field.
 */
const SUGGESTED_QUESTIONS = [
  "Where are you located?",
  "What are your prices?",
  "Do you offer refunds?",
  "How can I book an appointment?",
  "What are your business hours?",
];

/**
 * Mirrors lib/onboarding-readiness.ts's isFaqReady -- that module is
 * server-only-free (pure), but it types on ReadinessFaq, which this step
 * doesn't build; re-implemented against the real Faq row + the
 * ingestion-status map instead.
 *
 * Returns which of the two independent reasons a FAQ isn't ready, not just
 * a boolean: "too_short" (question/answer below the minimum) never
 * resolves on its own, while "processing" (embedding still running) does.
 * Collapsing both into one "Processing" state previously left a too-short
 * FAQ showing a permanently misleading badge, and had the poll loop below
 * spinning forever on a condition that could never clear (found live,
 * 2026-10-29 bugfix, STATE.md).
 */
function faqReadinessStatus(faq: Faq, docStatus: IngestionStatus | undefined): FaqReadinessStatus {
  if (faq.question.trim().length < FAQ_QUESTION_MIN_LENGTH || faq.answer.trim().length < FAQ_ANSWER_MIN_LENGTH) {
    return "too_short";
  }
  return docStatus === "complete" ? "ready" : "processing";
}

export function TrainFaqsStep({
  faqs,
  docStatusByFaqId,
}: {
  faqs: Faq[];
  /** Ingestion status of each FAQ's generated knowledge document, keyed by FAQ id (lib/onboarding-readiness-data.ts's getFaqGeneratedDocStatuses). Absent entries read as "not ready yet". */
  docStatusByFaqId: Record<string, IngestionStatus>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [suggestedQuestion, setSuggestedQuestion] = useState<{ text: string }>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { update } = useOnboardingPreview();

  const statusByFaqId = Object.fromEntries(
    faqs.map((f) => [f.id, faqReadinessStatus(f, docStatusByFaqId[f.id])]),
  ) as Record<string, FaqReadinessStatus>;
  const readyCount = faqs.filter((f) => statusByFaqId[f.id] === "ready").length;
  const tooShortCount = faqs.filter((f) => statusByFaqId[f.id] === "too_short").length;
  const valid = readyCount >= MIN_FAQS;
  // Only poll while something is genuinely still embedding -- a too-short
  // FAQ will never flip to "ready" on its own, so it must never keep this
  // loop alive.
  const stillProcessing = faqs.some((f) => statusByFaqId[f.id] === "processing");

  // While at least MIN_FAQS exist but aren't all retrieval-ready yet,
  // poll for the async embedding pipeline to finish so Continue enables
  // itself without a manual reload (2026-10-29 bugfix, STATE.md).
  useEffect(() => {
    if (!stillProcessing) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [stillProcessing, router]);

  function handleBack() {
    router.push("/onboarding?step=products");
  }

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      if (faqs.length > 0) update({ firstFaqQuestion: faqs[0].question, firstFaqAnswer: faqs[0].answer });
      const result = await advanceOnboarding("persona");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/onboarding?step=persona");
    });
  }

  const editingFaq = editingId ? (faqs.find((f) => f.id === editingId) ?? null) : null;
  const { toast } = useToast();
  const confirmAdded = useCallback(() => {
    toast({ variant: "success", title: "FAQ added" });
  }, [toast]);
  const confirmEdited = useCallback(() => {
    setEditingId(null);
    toast({ variant: "success", title: "FAQ saved" });
  }, [toast]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-medium text-ds-text-primary">
        {Math.min(readyCount, MIN_FAQS)} of {MIN_FAQS} minimum
      </p>

      {faqs.length > 0 ? (
        <div className="onboarding-table onboarding-faqs">
        <FaqsList
          faqs={faqs}
          canEdit
          deleteFaqAction={deleteFaqAction}
          onEdit={(id) => setEditingId(id)}
          readinessByFaqId={statusByFaqId}
        />
        </div>
      ) : (
        <p className="text-sm text-ds-text-secondary">No FAQs yet. Choose a common question below or write your own.</p>
      )}

      <Card className="onboarding-save-form flex flex-col gap-4">
        {editingFaq ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ds-text-primary">Edit FAQ</h2>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-xs font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
              >
                Cancel
              </button>
            </div>
            <FaqForm
              key={editingFaq.id}
              action={updateFaqInPlaceAction}
              id={editingFaq.id}
              initialQuestion={editingFaq.question}
              initialAnswer={editingFaq.answer}
              submitLabel="Save changes"
              pendingLabel="Saving…"
              onSuccess={confirmEdited}
            />
          </>
        ) : (
          <>
            <CardHeader title="Add an FAQ" />
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => setSuggestedQuestion({ text: question })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ds-border-strong px-3 py-1.5 text-left text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-surface-soft"
                >
                  {faqs.some((faq) => faq.question.trim().toLowerCase() === question.toLowerCase())
                    ? <><Check className="size-4 shrink-0 text-ds-success" aria-hidden /><span aria-label="Added" className="sr-only">Added: </span></>
                    : null}
                  {question}
                </button>
              ))}
            </div>
            <FaqForm
              action={createFaqAction}
              suggestedQuestion={suggestedQuestion}
              submitLabel="Add FAQ"
              pendingLabel="Adding…"
              onSuccess={confirmAdded}
            />
          </>
        )}
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <WizardActions onBack={handleBack}>
        <WizardContinue onClick={handleContinue} pending={isPending} disabled={!valid}
          reason={valid ? undefined : tooShortCount > 0
            ? "Lengthen the highlighted answers to at least " + FAQ_ANSWER_MIN_LENGTH + " characters"
            : stillProcessing
              ? "Finishing processing. This usually takes a few seconds."
              : "Add " + (MIN_FAQS - faqs.length) + " more to continue"} />
      </WizardActions>
    </div>
  );
}
