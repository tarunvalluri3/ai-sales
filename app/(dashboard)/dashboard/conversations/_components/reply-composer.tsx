"use client";

import { useActionState, useEffect, useRef } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";
import type { SendReplyState } from "../actions";
import { sendHumanReplyAction } from "../actions";
import type { Message } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: SendReplyState = {};

/**
 * WhatsApp-style bottom bar (2026-09-11 follow-up): a single row --
 * attach button, textarea, send button -- instead of the earlier stacked
 * label/textarea/button layout. The attach button is visibly disabled
 * ("File attachments coming soon") -- real upload is genuinely new scope
 * (new storage bucket, new `messages` schema, and WhatsApp's Cloud API
 * has zero existing media-message scaffolding), deliberately deferred to
 * its own pass per the user's explicit choice.
 */
export function ReplyComposer({
  conversationId,
  onSent,
  canEdit = true,
}: {
  conversationId: string;
  onSent?: (message: Message) => void;
  canEdit?: boolean;
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
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2 rounded-ds-lg border border-ds-border bg-ds-surface p-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <button
          type="button"
          disabled
          title="File attachments coming soon"
          aria-label="Attach a file (coming soon)"
          className="flex size-9 shrink-0 cursor-not-allowed items-center justify-center rounded-ds-sm text-ds-text-muted opacity-60"
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </button>
        <label htmlFor="reply-content" className="sr-only">
          Reply as a team member
        </label>
        <textarea
          id="reply-content"
          name="content"
          rows={1}
          required
          maxLength={2000}
          disabled={isPending || !canEdit}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Type your reply to the prospect…"
        />
        <button
          type="submit"
          disabled={isPending || !canEdit}
          title={canEdit ? "Send reply" : ROLE_DENIED_TITLE}
          aria-label="Send reply"
          className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
        </button>
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
