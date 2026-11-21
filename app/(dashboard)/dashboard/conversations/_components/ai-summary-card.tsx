"use client";

import { useActionState } from "react";
import { Info, Sparkles } from "lucide-react";
import { useBusinessTime } from "../../_components/business-time";
import { generateConversationSummaryAction, type GenerateSummaryState } from "../actions";

const initialState: GenerateSummaryState = {};

/**
 * On-demand AI conversation summary -- see `lib/conversation-summary.ts`
 * for why this is on-demand rather than auto-generated on every poll
 * tick. `currentMessageCount` is the server-rendered transcript length as
 * of page load (not live-updated by `LiveConversationPanel`'s own poll)
 * -- close enough for a "N new messages" nudge without wiring
 * cross-component live state for a secondary affordance.
 */
export function AiSummaryCard({
  conversationId,
  initialSummary,
  initialGeneratedAt,
  initialMessageCount,
  currentMessageCount,
}: {
  conversationId: string;
  initialSummary: string | null;
  initialGeneratedAt: string | null;
  initialMessageCount: number | null;
  currentMessageCount: number;
}) {
  const businessTime = useBusinessTime();
  const [state, formAction, isPending] = useActionState(generateConversationSummaryAction, initialState);

  const summary = state.summary ?? initialSummary;
  const generatedAt = state.generatedAt ?? initialGeneratedAt;
  const summarizedCount = state.messageCount ?? initialMessageCount;

  const newMessagesSince = summarizedCount !== null ? Math.max(0, currentMessageCount - summarizedCount) : 0;
  const isStale = summary !== null && newMessagesSince > 0;

  const buttonLabel = isPending
    ? "Summarizing…"
    : !summary
      ? "Generate summary"
      : isStale
        ? `Refresh (${newMessagesSince} new message${newMessagesSince === 1 ? "" : "s"})`
        : "Regenerate";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-ds-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-medium text-ds-text-primary">
          <Sparkles className="size-5" strokeWidth={1.75} aria-hidden="true" />
          AI summary
        </h3>
        {generatedAt ? (
          <span className="text-xs text-ds-text-secondary">Generated {businessTime.dateTime(generatedAt)}</span>
        ) : null}
      </div>

      {summary ? (
        <p className="text-sm leading-relaxed text-ds-text-primary">{summary}</p>
      ) : (
        <p className="text-xs text-ds-text-secondary">Generate a quick read on what this prospect is looking for.</p>
      )}

      <form action={formAction} className="flex flex-wrap items-center justify-between gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        {summary ? (
          <span className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
            <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            AI-generated · Not verified
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md text-sm font-medium text-ds-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {buttonLabel}
        </button>
      </form>

      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
