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
    <div className="hidden h-full flex-1 flex-col items-center justify-center gap-2 bg-ds-surface p-6 text-center md:flex">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-ds-surface-soft text-ds-text-primary">
        <MessagesSquare className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ds-text-primary">Select a conversation</p>
      <p className="max-w-sm text-xs text-ds-text-secondary">
        Pick a conversation from the list to see the transcript and prospect details.
      </p>
    </div>
  );
}
