import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getAnswerBankView, MAX_EDITED_ANSWER_CHARS, type AnswerBankEntryView } from "@/lib/answer-bank/dashboard";
import { Badge, type BadgeTone } from "../_components/badge";
import { EmptyState, PermissionNotice } from "../_components/state-views";
import { approveAnswerAction, refreshAnswersAction, regenerateAnswerAction, saveEditedAnswerAction } from "./actions";

// Regenerating an answer runs the model; give the action room.
export const maxDuration = 60;

const NOTICES: Record<string, { tone: "success" | "danger"; text: string }> = {
  saved: { tone: "success", text: "Your answer is saved and live." },
  approved: { tone: "success", text: "Answer approved." },
  regenerated: { tone: "success", text: "A new answer was generated and is live." },
  refreshed: { tone: "success", text: "Answers re-checked against your current content." },
  "regen-failed": {
    tone: "danger",
    text: "A new answer could not be generated safely, so nothing is stored for this question yet. Your AI keeps answering it live.",
  },
  "not-approvable": {
    tone: "danger",
    text: "This answer is out of date and is being rebuilt. Approve it once the new one appears.",
  },
  invalid: {
    tone: "danger",
    text: `Enter an answer of up to ${MAX_EDITED_ANSWER_CHARS} characters, without scripts or markup.`,
  },
  missing: { tone: "danger", text: "That answer no longer exists." },
  forbidden: { tone: "danger", text: "You do not have permission to change instant answers." },
  failed: { tone: "danger", text: "Something went wrong. Please try again." },
};

const NOTICE_TONE: Record<"success" | "danger", string> = {
  success: "border-ds-success/40 bg-ds-success-bg text-ds-success",
  danger: "border-ds-danger/40 bg-ds-danger-bg text-ds-danger",
};

const SECONDARY_BUTTON =
  "rounded-ds-md border border-ds-border px-3 py-1.5 text-sm font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent";

function statusOf(entry: AnswerBankEntryView): { tone: BadgeTone; label: string; hint: string } {
  if (entry.status === "ready" && entry.fresh) {
    return { tone: "success", label: "Live", hint: "Visitors get this answer instantly." };
  }
  if (entry.status === "pending" && entry.failureReason === "edited_answer_needs_review") {
    return {
      tone: "warning",
      label: "Review needed",
      hint: "Your products, services, FAQs or profile changed since you edited this. It is not served until you approve it again or regenerate it.",
    };
  }
  if (entry.status === "failed") {
    return {
      tone: "danger",
      label: "Not stored",
      hint: "A safe answer could not be generated, so your AI answers this question live. Add the missing detail to your knowledge, or write the answer yourself.",
    };
  }
  return {
    tone: "muted",
    label: "Updating",
    hint: "Your content changed. Your AI answers this live until the new answer is ready.",
  };
}

export default async function AnswerBankPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { businessId, orgRole } = await requireLiveBusinessContext();
  const canEdit = hasMinRole(orgRole, "org:member");
  const [view, { notice: noticeCode }] = await Promise.all([getAnswerBankView(businessId), searchParams]);
  const notice = noticeCode ? NOTICES[noticeCode] : undefined;
  const live = view.entries.filter((entry) => entry.status === "ready" && entry.fresh).length;

  return (
    <div className="flex flex-1 flex-col gap-6 bg-ds-bg p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-2xl font-semibold text-ds-text-primary">Instant answers</h1>
          <p className="text-sm text-ds-text-secondary">
            Answers your visitors get with no waiting: greetings, your suggested questions, your price and service list,
            and close matches to your FAQs. Anything else goes to your AI as usual. Stored answers are rebuilt whenever
            your products, services, FAQs, profile or knowledge change, so an old price is never shown.
          </p>
        </div>
        {canEdit ? (
          <form action={refreshAnswersAction}>
            <button type="submit" className={SECONDARY_BUTTON}>
              Refresh answers
            </button>
          </form>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className={`rounded-ds-lg border px-4 py-3 text-sm ${NOTICE_TONE[notice.tone]}`}>
          {notice.text}
        </p>
      ) : null}

      {!view.published ? (
        <p className="rounded-ds-lg border border-ds-warning/40 bg-ds-warning-bg px-4 py-3 text-sm text-ds-text-primary">
          Your AI is not published yet. Stored answers are prepared when you publish and only served while it is published.
        </p>
      ) : null}

      {view.entries.length === 0 ? (
        <EmptyState
          title="No stored answers yet"
          description="They are prepared automatically once your AI is published and you have suggested questions, products or services. You can also press Refresh answers."
        />
      ) : (
        <>
          <p className="text-sm text-ds-text-secondary">
            {live} of {view.entries.length} answers are live.
          </p>
          <ul className="flex flex-col gap-3">
            {view.entries.map((entry) => {
              const status = statusOf(entry);
              return (
                <li key={entry.id} className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 font-medium text-ds-text-primary">{entry.questionText}</p>
                    <Badge tone="accent" size="sm">
                      {entry.kind === "catalog" ? "Price & service list" : "Suggested question"}
                    </Badge>
                    {entry.ownerState !== "generated" ? (
                      <Badge tone="muted" size="sm">
                        {entry.ownerState === "edited" ? "Edited by you" : "Approved"}
                      </Badge>
                    ) : null}
                    <Badge tone={status.tone} size="sm" title={status.hint}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-ds-text-muted">{status.hint}</p>
                  {entry.answer ? (
                    <p className="whitespace-pre-line rounded-ds-md bg-ds-surface-soft px-3 py-2 text-sm text-ds-text-primary">
                      {entry.answer}
                    </p>
                  ) : null}
                  {entry.status === "failed" && entry.failureReason ? (
                    <p className="text-xs text-ds-text-muted">Reason: {entry.failureReason.replace(/_/g, " ")}</p>
                  ) : null}
                  {canEdit ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <details className="w-full max-w-xl">
                        <summary className={`w-fit cursor-pointer ${SECONDARY_BUTTON}`}>
                          {entry.answer ? "Edit answer" : "Write answer"}
                        </summary>
                        <form action={saveEditedAnswerAction} className="mt-3 flex flex-col gap-2">
                          <input type="hidden" name="id" value={entry.id} />
                          <label htmlFor={`answer-${entry.id}`} className="text-xs font-medium text-ds-text-secondary">
                            Your answer (shown exactly as written)
                          </label>
                          <textarea
                            id={`answer-${entry.id}`}
                            name="answer"
                            defaultValue={entry.answer ?? ""}
                            required
                            maxLength={MAX_EDITED_ANSWER_CHARS}
                            rows={5}
                            className="rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong"
                          />
                          <button
                            type="submit"
                            className="w-fit rounded-ds-md bg-ds-accent px-3 py-1.5 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
                          >
                            Save and go live
                          </button>
                        </form>
                      </details>
                      {entry.answer && (entry.fresh || entry.failureReason === "edited_answer_needs_review") ? (
                        <form action={approveAnswerAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit" className={SECONDARY_BUTTON}>
                            Approve
                          </button>
                        </form>
                      ) : null}
                      <form action={regenerateAnswerAction}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button type="submit" className={SECONDARY_BUTTON}>
                          Regenerate
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!canEdit ? <PermissionNotice /> : null}
    </div>
  );
}
