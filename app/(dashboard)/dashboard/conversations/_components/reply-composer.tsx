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
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="reply-content" className="text-sm font-medium text-zinc-900">
        Reply as a team member
      </label>
      <textarea
        id="reply-content"
        name="content"
        rows={3}
        required
        maxLength={2000}
        disabled={isPending}
        className="resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-60"
        placeholder="Type your reply to the prospect..."
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-dashboard-primary px-3 py-1.5 text-sm font-medium text-dashboard-on-primary hover:bg-dashboard-primary-hover disabled:opacity-60"
        >
          Send reply
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
