"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";
import type { SendReplyState } from "../actions";
import { sendHumanReplyAction } from "../actions";
import type { Message } from "@/lib/supabase/types";
import { ROLE_DENIED_TITLE } from "../../_components/delete-button";

const initialState: SendReplyState = {};
const MAX_LENGTH = 2000;

/**
 * Reply box: the textarea on top, then a row with the attach button, a live
 * character counter and the round send button. The attach button is visibly disabled ("File attachments
 * coming soon") -- real upload is genuinely new scope (new storage
 * bucket, new `messages` schema, and WhatsApp's Cloud API has zero
 * existing media-message scaffolding), deliberately out of scope here.
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
  // Display only (the "0 / 2,000" counter); the textarea stays uncontrolled
  // and the Server Action still validates the real length.
  const [length, setLength] = useState(0);
  // Reset the counter when a send succeeds: adjusted during render (React's
  // documented alternative to a state-setting effect), keyed on the action
  // result so it runs once per dispatch.
  const [processedState, setProcessedState] = useState(state);
  if (processedState !== state) {
    setProcessedState(state);
    if (state.success) setLength(0);
  }

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
      <div className="flex flex-col gap-1 rounded-2xl border border-ds-border-strong bg-ds-surface px-3 pt-2.5 pb-2 focus-within:border-ds-primary">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label htmlFor="reply-content" className="sr-only">
          Reply as a team member
        </label>
        <textarea
          id="reply-content"
          name="content"
          rows={2}
          required
          maxLength={MAX_LENGTH}
          disabled={isPending || !canEdit}
          onChange={(event) => setLength(event.target.value.length)}
          className="max-h-32 min-h-10 w-full resize-none rounded-none border-0 bg-transparent px-1 py-1 text-sm text-ds-text-primary placeholder:text-ds-text-faint focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Type your reply to the prospect…"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled
            title="File attachments coming soon"
            aria-label="Attach a file (coming soon)"
            className="flex size-9 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-secondary opacity-70"
          >
            <Paperclip strokeWidth={1.75} className="size-4" aria-hidden="true" />
          </button>
          <span className="ml-auto text-sm tabular-nums text-ds-text-secondary" aria-hidden="true">
            {length.toLocaleString("en-US")} / {MAX_LENGTH.toLocaleString("en-US")}
          </span>
          <button
            type="submit"
            disabled={isPending || !canEdit}
            title={canEdit ? "Send reply" : ROLE_DENIED_TITLE}
            aria-label="Send reply"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ds-primary text-ds-primary-on transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
          >
            <SendHorizontal strokeWidth={1.75} className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {state.error ? (
        <span role="alert" className="text-xs text-ds-danger">
          {state.error}
        </span>
      ) : null}
      {state.success && state.notice ? (
        <span role="status" className="text-xs text-ds-warning">
          {state.notice}
        </span>
      ) : null}
    </form>
  );
}
