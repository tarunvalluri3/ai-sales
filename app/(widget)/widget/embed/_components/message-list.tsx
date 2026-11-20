"use client";

import { AnimatePresence } from "motion/react";
import type { ChatMessage } from "../_lib/use-widget-chat";
import type { WidgetStrings } from "@/lib/widget-i18n";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { MessageBubble } from "./message-bubble";
import { NewMessagePill } from "./new-message-pill";
import { TypingIndicator } from "./typing-indicator";

export function MessageList({
  messages,
  greeting,
  strings,
  isAwaitingResponse,
  onRetry,
  suggestedQuestions,
  onSend,
}: {
  messages: ChatMessage[];
  greeting: string;
  strings: WidgetStrings;
  isAwaitingResponse: boolean;
  onRetry: (id: string) => void;
  suggestedQuestions: string[];
  onSend: (text: string, options?: { suggested?: boolean }) => void;
}) {
  // Widget reliability item 6: an empty reply placeholder is not a message yet
  // (it renders nothing); it counts once its first text arrives, so a reply
  // that starts while the visitor has scrolled up raises the pill.
  const visibleCount = messages.filter((m) => !(m.role === "assistant" && m.content === "")).length;
  const lastOwnMessageId = [...messages].reverse().find((m) => m.role === "user")?.id ?? null;
  const { containerRef, contentRef, onScroll, showNewMessagePill, scrollToBottom } = useStickToBottom(
    visibleCount,
    lastOwnMessageId,
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={onScroll}
        aria-live="polite"
        className="flex flex-1 flex-col overflow-y-auto overscroll-contain bg-widget-surface px-4 py-4"
      >
        <div ref={contentRef} className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <div className="w-fit max-w-[85%] bg-widget-assistant-bubble px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-foreground">
              {greeting}
            </div>
          ) : null}
          {messages.length === 0 && suggestedQuestions.length > 0 ? (
            <div className="flex flex-col gap-1.5" aria-label={strings.suggestedQuestionsLabel}>
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onSend(question, { suggested: true })}
                  className="w-fit max-w-[85%] border border-widget-border-strong px-3.5 py-2 text-left text-sm text-widget-foreground transition-colors hover:bg-widget-assistant-bubble"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} strings={strings} onRetry={onRetry} />
          ))}
          <AnimatePresence>{isAwaitingResponse ? <TypingIndicator /> : null}</AnimatePresence>
        </div>
      </div>
      {showNewMessagePill ? <NewMessagePill label={strings.newMessageLabel} onClick={() => scrollToBottom(true)} /> : null}
    </div>
  );
}
