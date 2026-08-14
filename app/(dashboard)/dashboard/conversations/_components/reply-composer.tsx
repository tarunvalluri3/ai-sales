"use client";

import { useActionState, useEffect, useRef } from "react";
import type { SendReplyState } from "../actions";
import { sendHumanReplyAction } from "../actions";
import type { Message } from "@/lib/supabase/types";

const initialState: SendReplyState = {};

export function ReplyComposer({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent?: (message: Message) => void;
}) {
  const [state, formAction, isPending] = useActionState(sendHumanReplyAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && state.message) {
      onSent?.(state.message);
      formRef.current?.reset();
    }
    // onSent is expected to be a stable callback from the parent; only
    // re-run when the action actually produces a new success result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <label
        htmlFor="reply-content"
        className="text-2xs font-medium tracking-wide-ds text-ds-text-muted uppercase"
      >
        Reply as a team member
      </label>
      <textarea
        id="reply-content"
        name="content"
        rows={3}
        required
        maxLength={2000}
        disabled={isPending}
        className="resize-none rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:border-ds-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Type your reply to the prospect..."
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Sending…" : "Send reply"}
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-ds-danger">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
