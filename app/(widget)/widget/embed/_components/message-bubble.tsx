"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ChatMessage } from "../_lib/use-widget-chat";
import type { WidgetStrings } from "@/lib/widget-i18n";
import { renderWidgetMarkdown } from "@/lib/widget-markdown";
import { EscalationBanner } from "./escalation-banner";
import { ProductRecommendationCards } from "./product-recommendation-cards";

function errorCopy(strings: WidgetStrings, kind: NonNullable<ChatMessage["errorKind"]>): string {
  if (kind === "unauthorized") return strings.errorUnauthorized;
  if (kind === "rate_limited") return strings.errorRateLimited;
  return strings.errorFailure;
}

export function MessageBubble({
  message,
  strings,
  onRetry,
}: {
  message: ChatMessage;
  strings: WidgetStrings;
  onRetry: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isHumanAgent = message.role === "human_agent";
  const prefersReducedMotion = useReducedMotion();

  if (message.role === "assistant" && message.content === "") {
    return null;
  }

  const bubbleClass = isUser
    ? "max-w-[85%] rounded-2xl rounded-br-md bg-widget-user-bubble px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-user-bubble-fg"
    : isHumanAgent
      ? "max-w-[85%] rounded-2xl rounded-bl-md border border-widget-human-bubble-border bg-widget-human-bubble-bg px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-human-bubble-fg"
      : "max-w-[85%] rounded-2xl rounded-bl-md bg-widget-assistant-bubble px-3.5 py-2.5 text-[15px] leading-relaxed text-widget-foreground";

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      {isHumanAgent ? (
        <span className="mb-1 flex items-center gap-1 text-xs font-medium text-widget-human-accent">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" fill="currentColor" />
            <path
              d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {strings.teamMemberLabel}
        </span>
      ) : null}
      <div className={bubbleClass}>{renderWidgetMarkdown(message.content)}</div>
      {message.recommendedProducts && message.recommendedProducts.length > 0 ? (
        <ProductRecommendationCards items={message.recommendedProducts} />
      ) : null}
      {message.status === "error" && message.errorKind ? (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-widget-error">{errorCopy(strings, message.errorKind)}</span>
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="text-xs font-medium text-widget-human-accent underline underline-offset-2 hover:text-widget-foreground"
          >
            {strings.retryLabel}
          </button>
        </div>
      ) : null}
      {message.role === "assistant" && message.escalate ? (
        <EscalationBanner text={strings.escalationBannerText} />
      ) : null}
    </motion.div>
  );
}
