"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pollConversationAction } from "../actions";
import { ControlToggle } from "./control-toggle";
import { ReplyComposer } from "./reply-composer";
import { MessageBubble } from "./message-bubble";
import type { ConversationControl, Message } from "@/lib/supabase/types";

const POLL_INTERVAL_MS = 3000;

/**
 * Owns polling state for one conversation detail page (Phase 15b).
 * Poll results are the single source of truth for `messages`/`control`
 * once mounted -- ControlToggle and ReplyComposer's own actions keep
 * their existing revalidatePath() calls (still correct for a fresh page
 * load), but this component treats them as feedback triggers for an
 * immediate extra poll, not as the source of truth for what's rendered
 * (prompts/phase-15b-staff-reply-and-live-polling.md's Decision 9).
 */
export function LiveConversationPanel({
  conversationId,
  initialControl,
  initialMessages,
  initialAsOf,
}: {
  conversationId: string;
  initialControl: ConversationControl;
  initialMessages: Message[];
  initialAsOf: string;
}) {
  const [control, setControl] = useState(initialControl);
  const [messages, setMessages] = useState(initialMessages);
  const asOfRef = useRef(initialAsOf);
  const knownIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  // Holds the latest `poll` so its own self-rescheduling setTimeout call
  // never has to reference the `poll` binding before it's assigned.
  const pollRef = useRef<() => Promise<void>>(async () => {});

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
      mergeMessages(result.messages);
      asOfRef.current = result.asOf;
      setControl(result.control);
    } catch {
      // A poll failure is invisible to the user -- keep the last-known
      // state and try again on the next tick.
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
    <>
      <div className="max-w-2xl">
        <ControlToggle conversationId={conversationId} control={control} onChanged={poll} />
      </div>

      {control === "human" ? (
        <div className="max-w-2xl">
          <ReplyComposer conversationId={conversationId} onSent={handleReplySent} />
        </div>
      ) : null}

      <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-600">No messages yet.</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
    </>
  );
}
