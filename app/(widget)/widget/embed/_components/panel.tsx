"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ChatMessage } from "../_lib/use-widget-chat";
import { PanelHeader } from "./panel-header";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

export function Panel({
  messages,
  isAwaitingResponse,
  isCoolingDown,
  panelError,
  consentGiven,
  onConsentChange,
  onSend,
  onRetry,
  onClose,
}: {
  messages: ChatMessage[];
  isAwaitingResponse: boolean;
  isCoolingDown: boolean;
  panelError: string | null;
  consentGiven: boolean;
  onConsentChange: (value: boolean) => void;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Chat"
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-widget-border-strong bg-widget-surface shadow-2xl shadow-black/20 sm:rounded-2xl"
    >
      <PanelHeader onClose={onClose} />
      {panelError ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-widget-muted">
          {panelError}
        </div>
      ) : (
        <>
          <MessageList messages={messages} isAwaitingResponse={isAwaitingResponse} onRetry={onRetry} />
          <Composer
            onSend={onSend}
            disabled={isAwaitingResponse || isCoolingDown}
            autoFocus
            consentGiven={consentGiven}
            onConsentChange={onConsentChange}
          />
        </>
      )}
    </motion.div>
  );
}
