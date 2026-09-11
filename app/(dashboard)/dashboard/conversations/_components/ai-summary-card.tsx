"use client";

import { useActionState } from "react";
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
    <div className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ds-text-primary">AI summary</h3>
        {generatedAt ? (
          <span className="text-2xs text-ds-text-muted">{new Date(generatedAt).toLocaleString("en-US")}</span>
        ) : null}
      </div>

      {summary ? (
        <>
          <p className="text-sm text-ds-text-secondary">{summary}</p>
          <p className="text-2xs text-ds-text-muted">AI-generated — may be inaccurate, not verified.</p>
        </>
      ) : (
        <p className="text-xs text-ds-text-muted">Generate a quick read on what this prospect is looking for.</p>
      )}

      <form action={formAction}>
        <input type="hidden" name="conversationId" value={conversationId} />
        <button
          type="submit"
          disabled={isPending}
          className="mt-1 inline-flex items-center rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-1.5 text-xs font-semibold text-ds-text-primary transition-colors hover:border-ds-border-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
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
