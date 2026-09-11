import { MessagesSquare } from "lucide-react";

/**
 * The conversations inbox's "no conversation selected" state (2026-09-11
 * redesign) -- the chat list itself now lives in `layout.tsx`/
 * `ChatListPane`, always visible alongside this on desktop. On mobile,
 * `ChatListPane` shows in full and this page is effectively not reached
 * until a conversation is picked (its own visibility already handles
 * that split).
 */
export default function ConversationsIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-ds-bg p-6 text-center">
      <MessagesSquare className="size-8 text-ds-text-muted" aria-hidden="true" />
      <p className="text-sm font-medium text-ds-text-primary">Select a conversation</p>
      <p className="max-w-sm text-xs text-ds-text-muted">
        Pick a conversation from the list to see the transcript and prospect details.
      </p>
    </div>
  );
}
