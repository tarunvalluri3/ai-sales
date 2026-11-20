"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideOnNewMessage, isNearBottom, shouldFollowGrowth } from "@/lib/stick-to-bottom";

/**
 * Widget reliability item 6: keeps a chat scrolled to the newest message while
 * the reader is at the bottom, and shows a "New message" pill instead of
 * jumping when they have scrolled up (rules: lib/stick-to-bottom.ts). Used by
 * the widget's MessageList and the dashboard/onboarding SandboxChatPanel.
 *
 * `messageCount` is the number of rendered messages; `lastOwnMessageId` is the
 * id of the reader's own newest message -- when it changes, the reader just
 * sent something and the view always scrolls to it (a send adds the message
 * AND an empty reply placeholder, so "is the last message mine" is not enough).
 * Attach `containerRef` + `onScroll` to the scroller and `contentRef` to the
 * element wrapping its content (watched for in-place growth: streaming text,
 * images loading).
 */
export function useStickToBottom(messageCount: number, lastOwnMessageId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const previousCountRef = useRef(messageCount);
  const previousOwnIdRef = useRef(lastOwnMessageId);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    atBottomRef.current = true;
    setShowNewMessagePill(false);
  }, []);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    atBottomRef.current = isNearBottom(container);
    if (atBottomRef.current) setShowNewMessagePill(false);
  }, []);

  // A new message: scroll to it, or show the pill (never both).
  useEffect(() => {
    const previous = previousCountRef.current;
    const ownMessage = lastOwnMessageId !== null && lastOwnMessageId !== previousOwnIdRef.current;
    previousCountRef.current = messageCount;
    previousOwnIdRef.current = lastOwnMessageId;
    if (messageCount <= previous && !ownMessage) return;
    const decision = decideOnNewMessage({ atBottom: atBottomRef.current, ownMessage });
    if (decision === "scroll") {
      scrollToBottom();
    } else {
      // A one-off notification of new content below the fold, not derived
      // render state: the pill clears itself when the reader reaches the end.
      setShowNewMessagePill(true);
    }
  }, [messageCount, lastOwnMessageId, scrollToBottom]);

  // Content growing in place (streaming text, an image loading) stays pinned
  // while the reader is at the bottom.
  useEffect(() => {
    const content = contentRef.current;
    const container = containerRef.current;
    if (!content || !container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (shouldFollowGrowth(atBottomRef.current)) container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return { containerRef, contentRef, onScroll, showNewMessagePill, scrollToBottom };
}
