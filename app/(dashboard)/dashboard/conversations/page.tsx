import { MessagesSquare } from "lucide-react";

/**
 * The conversations inbox's "no conversation selected" state -- the
 * chat list itself now lives in `layout.tsx`/`ChatListPane`, always
 * visible alongside this on desktop. On mobile, `ChatListPane` shows in
 * full here instead (its own route-based visibility already handles
 * that split), so this page renders nothing visible below `md:`.
 */
export default function ConversationsIndexPage() {
  return (
    <div className="hidden h-full flex-1 flex-col items-center justify-center gap-2 bg-ds-bg p-6 text-center md:flex">
      <MessagesSquare className="size-8 text-ds-text-muted" aria-hidden="true" />
      <p className="text-sm font-medium text-ds-text-primary">Select a conversation</p>
      <p className="max-w-sm text-xs text-ds-text-muted">
        Pick a conversation from the list to see the transcript and prospect details.
      </p>
    </div>
  );
}
