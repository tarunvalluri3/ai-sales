"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "../_lib/use-widget-chat";
import { PanelHeader } from "./panel-header";
import { MessageList } from "./message-list";
import { Composer } from "./composer";

export function Panel({
  messages,
  isAwaitingResponse,
  isCoolingDown,
  panelError,
  onSend,
  onRetry,
  onClose,
}: {
  messages: ChatMessage[];
  isAwaitingResponse: boolean;
  isCoolingDown: boolean;
  panelError: string | null;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chat"
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-widget-border bg-widget-surface shadow-xl sm:rounded-2xl"
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
          />
        </>
      )}
    </div>
  );
}
