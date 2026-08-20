"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import type { ChatMessage } from "../_lib/use-widget-chat";
import type { WidgetStrings } from "@/lib/widget-i18n";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function MessageList({
  messages,
  greeting,
  strings,
  isAwaitingResponse,
  onRetry,
}: {
  messages: ChatMessage[];
  greeting: string;
  strings: WidgetStrings;
  isAwaitingResponse: boolean;
  onRetry: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (wasNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isAwaitingResponse]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    wasNearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      aria-live="polite"
      className="flex flex-1 flex-col gap-3 overflow-y-auto bg-widget-surface px-4 py-4"
    >
      {messages.length === 0 ? (
        <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-widget-assistant-bubble px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-foreground">
          {greeting}
        </div>
      ) : null}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} strings={strings} onRetry={onRetry} />
      ))}
      <AnimatePresence>{isAwaitingResponse ? <TypingIndicator /> : null}</AnimatePresence>
    </div>
  );
}
