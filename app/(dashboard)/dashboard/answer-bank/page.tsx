import { requireLiveBusinessContext } from "@/lib/business-context";
import { hasMinRole } from "@/lib/auth";
import { getAnswerBankView, MAX_EDITED_ANSWER_CHARS, type AnswerBankEntryView } from "@/lib/answer-bank/dashboard";
import { Ban, Check, Info, LoaderCircle, MessageCircle, Pencil, RefreshCw, Tag, UserRound, Zap } from "lucide-react";
import { InfoBanner, PageHeader, Pill, btnGhost, btnGhostSm, btnOutlineSm, btnPrimarySm, type PillTone } from "../_components/ui";
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
  success: "bg-ds-success-bg text-ds-success",
  danger: "bg-ds-danger-bg text-ds-danger",
};

type EntryStatus = { tone: PillTone; label: string; hint: string; kind: "live" | "review" | "failed" | "updating" };

function statusOf(entry: AnswerBankEntryView): EntryStatus {
  if (entry.status === "ready" && entry.fresh) {
    return { tone: "lime", label: "Live", hint: "Visitors get this answer instantly.", kind: "live" };
  }
  if (entry.status === "pending" && entry.failureReason === "edited_answer_needs_review") {
    return {
      tone: "amber",
      kind: "review",
      label: "Review needed",
      hint: "Your products, services, FAQs or profile changed since you edited this. It is not served until you approve it again or regenerate it.",
    };
  }
  if (entry.status === "failed") {
    return {
      tone: "gray",
      kind: "failed",
      label: "Not stored",
      hint: "A safe answer could not be generated, so your AI answers this question live. Add the missing detail to your knowledge, or write the answer yourself.",
    };
  }
  return {
    tone: "gray",
    kind: "updating",
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
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        icon={Zap}
        title="Instant Answers"
        description="Ready-made answers for common questions, served without the wait."
        actions={
          canEdit ? (
            <form action={refreshAnswersAction}>
              <button type="submit" className={btnGhost}>
                <RefreshCw className="size-5" strokeWidth={1.75} aria-hidden="true" />
                Refresh answers
              </button>
            </form>
          ) : null
        }
      />

      <InfoBanner icon={Info}>
        Greetings, your suggested questions, your price and service list, and close matches to your FAQs. Answers are rebuilt
        when your content changes, so outdated information is not served. Anything else goes to your AI as usual.
      </InfoBanner>

      {notice ? (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${NOTICE_TONE[notice.tone]}`}>
          {notice.text}
        </p>
      ) : null}

      {!view.published ? (
        <p className="rounded-2xl bg-ds-warning-bg px-4 py-3 text-sm text-ds-text-primary">
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
          <p className="text-sm text-ds-text-primary">
            {live} of {view.entries.length} answers are live.
          </p>
          <ul className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            {view.entries.map((entry) => {
              const status = statusOf(entry);
              const needsReview = status.kind === "review";
              return (
                <li
                  key={entry.id}
                  className={`relative flex flex-col gap-3 overflow-hidden rounded-3xl border bg-ds-surface p-5 ${
                    needsReview ? "border-ds-warning/60 pl-8" : "border-ds-border"
                  }`}
                >
                  {needsReview ? <span aria-hidden="true" className="absolute inset-y-4 left-3.5 w-1.5 rounded-full bg-ds-primary" /> : null}
                  <h2 className="text-base leading-snug font-medium text-ds-text-primary">{entry.questionText}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="outline" size="sm" className="py-1">
                      {entry.kind === "catalog" ? (
                        <Tag strokeWidth={1.75} className="size-3.5" aria-hidden="true" />
                      ) : (
                        <MessageCircle strokeWidth={1.75} className="size-3.5" aria-hidden="true" />
                      )}
                      {entry.kind === "catalog" ? "Price & service list" : "Suggested question"}
                    </Pill>
                    {entry.ownerState !== "generated" ? (
                      <Pill tone={entry.ownerState === "edited" ? "outline" : "lime"} size="sm" className="py-1">
                        <UserRound strokeWidth={1.75} className="size-3.5" aria-hidden="true" />
                        {entry.ownerState === "edited" ? "Edited by you" : "Approved"}
                      </Pill>
                    ) : null}
                    <Pill tone={status.tone} size="sm" className="py-1 font-medium" title={status.hint} dot={status.kind === "live"}>
                      {status.kind === "failed" ? <Ban strokeWidth={1.75} className="size-3.5" aria-hidden="true" /> : null}
                      {status.kind === "updating" ? <LoaderCircle strokeWidth={1.75} className="size-3.5" aria-hidden="true" /> : null}
                      {status.label}
                    </Pill>
                  </div>

                  {status.kind !== "live" ? <p className="text-sm text-ds-text-primary">{status.hint}</p> : null}

                  {entry.answer ? (
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-ds-text-primary">Answer</p>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ds-text-primary">{entry.answer}</p>
                    </div>
                  ) : status.kind === "updating" ? (
                    <div aria-hidden="true" className="flex flex-col gap-2 py-1">
                      <span className="h-3 w-full rounded-full bg-ds-surface-soft" />
                      <span className="h-3 w-2/3 rounded-full bg-ds-surface-soft" />
                    </div>
                  ) : null}

                  {entry.status === "failed" && entry.failureReason ? (
                    <p className="text-xs text-ds-text-secondary">Reason: {entry.failureReason.replace(/_/g, " ")}</p>
                  ) : null}

                  {canEdit ? (
                    <div className="flex flex-wrap items-start gap-3 border-t border-ds-border pt-3">
                      {/* Native disclosure: the summary stays visible so the editor
                          can be closed again without any client JS. */}
                      <details className="open:order-first open:w-full" open={needsReview}>
                        <summary className={`${btnOutlineSm} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                          <Pencil className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          {entry.answer ? "Edit answer" : "Write answer"}
                        </summary>
                        <form action={saveEditedAnswerAction} className="mt-3 flex w-full flex-col gap-2">
                          <input type="hidden" name="id" value={entry.id} />
                          <label htmlFor={`answer-${entry.id}`} className="text-xs font-medium text-ds-text-primary">
                            Your answer (shown exactly as written)
                          </label>
                          <textarea
                            id={`answer-${entry.id}`}
                            name="answer"
                            defaultValue={entry.answer ?? ""}
                            required
                            maxLength={MAX_EDITED_ANSWER_CHARS}
                            rows={4}
                            className="w-full rounded-xl border border-ds-border-strong bg-ds-surface px-3.5 py-2.5 text-sm leading-relaxed text-ds-text-primary"
                          />
                          <button type="submit" className={`${btnPrimarySm} w-fit`}>
                            <Check strokeWidth={1.75} className="size-4" aria-hidden="true" />
                            Save and go live
                          </button>
                        </form>
                      </details>
                      {entry.answer && (entry.fresh || entry.failureReason === "edited_answer_needs_review") ? (
                        <form action={approveAnswerAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit" className={btnGhostSm}>
                            <Check strokeWidth={1.75} className="size-4" aria-hidden="true" />
                            Approve
                          </button>
                        </form>
                      ) : null}
                      <form action={regenerateAnswerAction}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button type="submit" className={btnGhostSm}>
                          <RefreshCw className="size-4" strokeWidth={1.75} aria-hidden="true" />
                          Regenerate
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="flex items-center gap-3 text-sm text-ds-text-secondary">
            <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Edited answers need review when their source content changes.
          </p>
        </>
      )}

      {!canEdit ? <PermissionNotice /> : null}
    </div>
  );
}
