"use client";

import type { ChatMessage } from "../_lib/use-widget-chat";
import { EscalationBanner } from "./escalation-banner";

const ERROR_COPY: Record<NonNullable<ChatMessage["errorKind"]>, string> = {
  unauthorized: "This chat isn't available right now.",
  rate_limited: "Too many messages — please wait a moment and try again.",
  failure: "Something went wrong. Check your connection and try again.",
};

export function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";

  if (message.role === "assistant" && message.content === "") {
    return null;
  }

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {isHumanAgent ? (
        <span className="mb-1 text-xs text-widget-muted">A team member replied</span>
      ) : null}
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-widget-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-on-primary"
            : "max-w-[85%] rounded-2xl rounded-bl-md bg-widget-assistant-bubble px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-foreground"
        }
      >
        {message.content}
      </div>
      {message.status === "error" && message.errorKind ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-widget-error">{ERROR_COPY[message.errorKind]}</span>
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="text-xs font-medium text-widget-primary underline underline-offset-2 hover:text-widget-primary-hover"
          >
            Retry
          </button>
        </div>
      ) : null}
      {message.role === "assistant" && message.escalate ? <EscalationBanner /> : null}
    </div>
  );
}
