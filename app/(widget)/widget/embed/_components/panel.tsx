"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ChatMessage, RecentChatSummary } from "../_lib/use-widget-chat";
import type { WidgetStrings } from "@/lib/widget-i18n";
import { PanelHeader } from "./panel-header";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { RecentChatsList } from "./recent-chats-list";
import { useFocusTrap } from "../_lib/use-focus-trap";

export function Panel({
  businessName,
  strings,
  greeting,
  logoUrl,
  suggestedQuestions,
  messages,
  isAwaitingResponse,
  isCoolingDown,
  panelError,
  consentGiven,
  onConsentChange,
  onSend,
  onRetry,
  onClose,
  onStartNewChat,
  recentChats,
  isLoadingRecentChats,
  onRequestRecentChats,
  onSelectRecentChat,
}: {
  businessName: string;
  strings: WidgetStrings;
  greeting: string;
  logoUrl: string | null;
  suggestedQuestions: string[];
  messages: ChatMessage[];
  isAwaitingResponse: boolean;
  isCoolingDown: boolean;
  panelError: string | null;
  consentGiven: boolean;
  onConsentChange: (value: boolean) => void;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onClose: () => void;
  onStartNewChat: () => void;
  recentChats: RecentChatSummary[] | null;
  isLoadingRecentChats: boolean;
  onRequestRecentChats: () => void;
  onSelectRecentChat: (conversationId: string) => void;
}) {
  const panelRef = useFocusTrap(true);
  const prefersReducedMotion = useReducedMotion();
  const [view, setView] = useState<"chat" | "recent">("chat");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (view === "recent") {
        setView("chat");
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, view]);

  function handleViewRecentChats() {
    setView("recent");
    onRequestRecentChats();
  }

  function handleSelectRecentChat(conversationId: string) {
    setView("chat");
    onSelectRecentChat(conversationId);
  }

  return (
    <motion.div
      ref={panelRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="true"
      aria-label={strings.panelTitle}
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-widget-border-strong bg-widget-surface shadow-2xl shadow-black/20 sm:rounded-2xl"
    >
      <PanelHeader
        businessName={businessName}
        logoUrl={logoUrl}
        strings={strings}
        onClose={onClose}
        onStartNewChat={onStartNewChat}
        onEndChat={onClose}
        onViewRecentChats={handleViewRecentChats}
      />
      {panelError ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-widget-muted">
          {panelError}
        </div>
      ) : view === "recent" ? (
        <RecentChatsList
          strings={strings}
          conversations={recentChats}
          isLoading={isLoadingRecentChats}
          onBack={() => setView("chat")}
          onSelect={handleSelectRecentChat}
        />
      ) : (
        <>
          <MessageList
            messages={messages}
            greeting={greeting}
            strings={strings}
            isAwaitingResponse={isAwaitingResponse}
            onRetry={onRetry}
            suggestedQuestions={suggestedQuestions}
            onSend={onSend}
          />
          <Composer
            strings={strings}
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
