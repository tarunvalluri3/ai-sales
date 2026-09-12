"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { pollConversationAction } from "../actions";
import { ControlToggle } from "./control-toggle";
import { ReplyComposer } from "./reply-composer";
import { MessageBubble } from "./message-bubble";
import { DismissAttentionButton } from "../../_components/dismiss-attention-button";
import type { ConversationControl, Message } from "@/lib/supabase/types";

const POLL_INTERVAL_MS = 1000;

// Same reasoning as ChatListPane's own STALE_FAILURE_THRESHOLD -- a single
// dropped poll stays invisible, only sustained failure surfaces a notice.
const STALE_FAILURE_THRESHOLD = 3;

/**
 * Owns polling state for one conversation detail page (Phase 15b).
 * Poll results are the single source of truth for `messages`/`control`
 * once mounted -- ControlToggle/ReplyComposer/DismissAttentionButton's
 * actions no longer call `revalidatePath()` (removed -- it was forcing
 * the shared conversations/layout.tsx's business-wide list query to
 * re-run on every take-over/reply/dismiss click, a real production
 * performance regression; see STATE.md). This component's own
 * `onChanged`/`onSent`/`onDismissed`-triggered immediate poll is the
 * only mechanism these actions rely on for a live UI update.
 */
export function LiveConversationPanel({
  conversationId,
  initialControl,
  initialNeedsAttention,
  initialMessages,
  initialAsOf,
  canEdit = true,
}: {
  conversationId: string;
  initialControl: ConversationControl;
  initialNeedsAttention: boolean;
  initialMessages: Message[];
  initialAsOf: string;
  canEdit?: boolean;
}) {
  const [control, setControl] = useState(initialControl);
  const [needsAttention, setNeedsAttention] = useState(initialNeedsAttention);
  const [messages, setMessages] = useState(initialMessages);
  const [isStale, setIsStale] = useState(false);
  const asOfRef = useRef(initialAsOf);
  const knownIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const consecutiveFailuresRef = useRef(0);
  // Holds the latest `poll` so its own self-rescheduling setTimeout call
  // never has to reference the `poll` binding before it's assigned.
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const shouldReduceMotion = useReducedMotion();

  const mergeMessages = useCallback((incoming: Message[]) => {
    const fresh = incoming.filter((message) => !knownIdsRef.current.has(message.id));
    if (fresh.length === 0) return;
    for (const message of fresh) knownIdsRef.current.add(message.id);
    setMessages((prev) => [...prev, ...fresh]);
  }, []);

  const poll = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      const result = await pollConversationAction(conversationId, asOfRef.current);
      if (!isMountedRef.current) return;
      consecutiveFailuresRef.current = 0;
      setIsStale(false);
      mergeMessages(result.messages);
      asOfRef.current = result.asOf;
      setControl(result.control);
      setNeedsAttention(result.needsAttention);
    } catch {
      // A single dropped poll is still invisible -- keep the last-known
      // state and try again on the next tick. Only sustained failure
      // surfaces the "Updates paused" notice below.
      consecutiveFailuresRef.current += 1;
      if (isMountedRef.current && consecutiveFailuresRef.current >= STALE_FAILURE_THRESHOLD) {
        setIsStale(true);
      }
    }

    if (!isMountedRef.current) return;
    if (document.visibilityState === "visible") {
      timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
    }
  }, [conversationId, mergeMessages]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    isMountedRef.current = true;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void pollRef.current();
      } else if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    timeoutRef.current = setTimeout(() => pollRef.current(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  const handleReplySent = useCallback(
    (message: Message) => {
      mergeMessages([message]);
      void poll();
    },
    [mergeMessages, poll],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-3 md:p-6 md:pt-3">
      <div className="flex shrink-0 flex-wrap items-start gap-3">
        <ControlToggle
          conversationId={conversationId}
          control={control}
          needsAttention={needsAttention}
          onChanged={poll}
          canEdit={canEdit}
        />
        {needsAttention ? (
          <div className="flex items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-warning-bg px-4 py-2.5">
            <span className="text-sm font-medium text-ds-warning">Needs attention</span>
            <DismissAttentionButton conversationId={conversationId} onDismissed={poll} canEdit={canEdit} />
          </div>
        ) : null}
        {isStale ? (
          <p className="ml-auto flex items-center gap-1 text-2xs text-ds-warning" role="status">
            <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
            Updates paused — retrying…
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-ds-lg border border-ds-border bg-ds-surface p-4 sm:p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-ds-text-muted">No messages yet.</p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                layout={!shouldReduceMotion}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <MessageBubble message={message} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {control === "human" ? (
        <div className="shrink-0">
          <ReplyComposer conversationId={conversationId} onSent={handleReplySent} canEdit={canEdit} />
        </div>
      ) : null}
    </div>
  );
}
