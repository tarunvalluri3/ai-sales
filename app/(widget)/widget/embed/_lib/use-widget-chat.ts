"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseFromParentMessage, postToParent, type WidgetErrorKind } from "./post-message";
import type { WidgetStrings } from "@/lib/widget-i18n";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "human_agent";
  content: string;
  status?: "sending" | "error";
  errorKind?: WidgetErrorKind;
  escalate?: boolean;
};

const MAX_MESSAGE_LENGTH = 2000;
const RESPONSE_TIMEOUT_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 5_000;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useWidgetChat(strings: WidgetStrings) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  // Phase 22c: set by the widget's own consent checkbox, never inferred
  // from chat text. Sent with every message once true -- the server
  // records it idempotently, so re-sending it on later messages is
  // harmless.
  const [consentGiven, setConsentGiven] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const hasSucceededRef = useRef(false);
  const consentGivenRef = useRef(false);
  const pendingRef = useRef(
    new Map<string, { userMessageId: string; assistantPlaceholderId: string; text: string }>(),
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const message = parseFromParentMessage(event.data);
      if (!message) return;

      if (message.type === "widget:response") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        hasSucceededRef.current = true;
        conversationIdRef.current = message.conversationId;
        setIsAwaitingResponse(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pending.assistantPlaceholderId
              ? { id: m.id, role: "assistant", content: message.answer, escalate: message.escalate }
              : m,
          ),
        );
      } else if (message.type === "widget:error") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        setIsAwaitingResponse(false);

        if (message.kind === "unauthorized" && !hasSucceededRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== pending.assistantPlaceholderId));
          setPanelError(strings.panelUnavailable);
          return;
        }

        if (message.kind === "rate_limited") {
          setIsCoolingDown(true);
          setTimeout(() => setIsCoolingDown(false), RATE_LIMIT_COOLDOWN_MS);
        }

        setMessages((prev) =>
          prev
            .filter((m) => m.id !== pending.assistantPlaceholderId)
            .map((m) =>
              m.id === pending.userMessageId ? { ...m, status: "error", errorKind: message.kind } : m,
            ),
        );
      } else if (message.type === "widget:poll_result") {
        if (message.messages.length === 0) return;
        setMessages((prev) => {
          // De-dup by id (defense in depth alongside the loader's own
          // cursor -- prompts/phase-15b-staff-reply-and-live-polling.md's
          // Decision 7): a poll result can never overwrite/duplicate a
          // message this widget already knows about.
          const knownIds = new Set(prev.map((m) => m.id));
          const fresh = message.messages.filter((m) => !knownIds.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh.map((m) => ({ id: m.id, role: m.role, content: m.content }))];
        });
      } else if (message.type === "widget:restore") {
        // Sent once, right after the loader fetches /api/chat/restore
        // for a conversationId it found in localStorage (Phase 25a).
        // Only applied while this widget instance has no messages of
        // its own yet -- if the prospect has already sent something in
        // this session (a race between mount and the fetch resolving),
        // restoring here would clobber real in-flight state.
        if (message.messages.length === 0) return;
        setMessages((prev) => (prev.length > 0 ? prev : message.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))));
        hasSucceededRef.current = true;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [strings]);

  const dispatchSend = useCallback((text: string, userMessageId: string) => {
    const requestId = newId();
    const assistantPlaceholderId = newId();
    pendingRef.current.set(requestId, { userMessageId, assistantPlaceholderId, text });

    setMessages((prev) => [...prev, { id: assistantPlaceholderId, role: "assistant", content: "" }]);
    setIsAwaitingResponse(true);
    postToParent({ type: "widget:send", requestId, text, consentGiven: consentGivenRef.current });

    setTimeout(() => {
      if (!pendingRef.current.has(requestId)) return;
      pendingRef.current.delete(requestId);
      setIsAwaitingResponse(false);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== assistantPlaceholderId)
          .map((m) => (m.id === userMessageId ? { ...m, status: "error", errorKind: "failure" } : m)),
      );
    }, RESPONSE_TIMEOUT_MS);
  }, []);

  const sendMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text || isAwaitingResponse || isCoolingDown) return;

      const userMessageId = newId();
      setMessages((prev) => [...prev, { id: userMessageId, role: "user", content: text }]);
      dispatchSend(text, userMessageId);
    },
    [isAwaitingResponse, isCoolingDown, dispatchSend],
  );

  const retryMessage = useCallback(
    (messageId: string) => {
      if (isAwaitingResponse || isCoolingDown) return;
      const target = messages.find((m) => m.id === messageId);
      if (!target || target.role !== "user") return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { id: m.id, role: "user", content: m.content } : m)),
      );
      dispatchSend(target.content, messageId);
    },
    [messages, isAwaitingResponse, isCoolingDown, dispatchSend],
  );

  const setConsent = useCallback((value: boolean) => {
    consentGivenRef.current = value;
    setConsentGiven(value);
  }, []);

  return {
    messages,
    isAwaitingResponse,
    isCoolingDown,
    panelError,
    consentGiven,
    setConsentGiven: setConsent,
    sendMessage,
    retryMessage,
  };
}
