"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseFromParentMessage, postToParent, type WidgetErrorKind, type WidgetRecommendedProduct } from "./post-message";
import type { WidgetStrings } from "@/lib/widget-i18n";
import { CHAT_CLIENT_TIMEOUT_MS } from "@/lib/chat-timeouts";
import { appendStreamDelta, finalizeStreamMessage, finalizeAbortedStream, retractStreamMessage } from "@/lib/widget-stream-reducer";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "human_agent";
  content: string;
  status?: "sending" | "error";
  errorKind?: WidgetErrorKind;
  escalate?: boolean;
  recommendedProducts?: WidgetRecommendedProduct[];
};

export type RecentChatSummary = {
  id: string;
  createdAt: string;
  preview: string | null;
};

const MAX_MESSAGE_LENGTH = 2000;
/**
 * Derived from the server's own deadline, never written independently --
 * see `lib/chat-timeouts.ts` for the ordering and why it matters. This was
 * a hardcoded 30s while the server allowed 60s, so a slow-but-successful
 * turn showed the prospect an error for an answer that did arrive: 5 of
 * 220 production turns on 2026-10-21.
 *
 * This timer is the *only* client-side deadline on a chat turn. The
 * loader's own fetch (public/widget-loader.js handleSend) deliberately
 * passes no AbortSignal and sets no timeout of its own, so there is no
 * second, shorter clock hiding there -- checked 2026-10-21.
 */
const RESPONSE_TIMEOUT_MS = CHAT_CLIENT_TIMEOUT_MS;
const RATE_LIMIT_COOLDOWN_MS = 5_000;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useWidgetChat(strings: WidgetStrings) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  // feat/chat-streaming: true from send until the stream's terminal event.
  // Distinct from isAwaitingResponse, which flips off on the first token so
  // the typing indicator gives way to the streaming text -- isStreaming
  // keeps the composer's stop control visible while tokens are still
  // arriving, and keeps the composer from accepting a second send.
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  // Phase 22c: set by the widget's own consent checkbox, never inferred
  // from chat text. Sent with every message once true -- the server
  // records it idempotently, so re-sending it on later messages is
  // harmless.
  const [consentGiven, setConsentGiven] = useState(false);
  const [recentChats, setRecentChats] = useState<RecentChatSummary[] | null>(null);
  const [isLoadingRecentChats, setIsLoadingRecentChats] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const hasSucceededRef = useRef(false);
  const consentGivenRef = useRef(false);
  const pendingRef = useRef(
    new Map<
      string,
      { userMessageId: string; assistantPlaceholderId: string; text: string; timeoutId?: ReturnType<typeof setTimeout>; sawDelta?: boolean }
    >(),
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
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        hasSucceededRef.current = true;
        conversationIdRef.current = message.conversationId;
        setIsAwaitingResponse(false);
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pending.assistantPlaceholderId
              ? {
                  id: m.id,
                  role: "assistant",
                  content: message.answer,
                  escalate: message.escalate,
                  recommendedProducts: message.recommendedProducts,
                }
              : m,
          ),
        );
      } else if (message.type === "widget:stream_start") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        conversationIdRef.current = message.conversationId;
      } else if (message.type === "widget:stream_delta") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        if (!pending.sawDelta) {
          pending.sawDelta = true;
          // The first token proves the turn is live: drop the whole-turn
          // client timeout and swap the typing indicator for the streaming
          // text. A stalled stream is still bounded by the server's own AI
          // deadline, which ends the turn with a terminal event.
          if (pending.timeoutId) clearTimeout(pending.timeoutId);
          setIsAwaitingResponse(false);
        }
        setMessages((prev) => appendStreamDelta(prev, pending.assistantPlaceholderId, message.text));
      } else if (message.type === "widget:stream_retract") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        // The retract may be the first visible text of the turn (nothing had been
        // released yet), so it also ends the typing indicator like a first delta.
        if (!pending.sawDelta) {
          pending.sawDelta = true;
          if (pending.timeoutId) clearTimeout(pending.timeoutId);
          setIsAwaitingResponse(false);
        }
        setMessages((prev) => retractStreamMessage(prev, pending.assistantPlaceholderId, message.text));
      } else if (message.type === "widget:stream_end") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        hasSucceededRef.current = true;
        setIsAwaitingResponse(false);
        setIsStreaming(false);
        setMessages((prev) =>
          finalizeStreamMessage(prev, pending.assistantPlaceholderId, {
            escalate: message.escalate,
            recommendedProducts: message.recommendedProducts,
          }),
        );
      } else if (message.type === "widget:stream_aborted") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        setIsAwaitingResponse(false);
        setIsStreaming(false);
        // Keep whatever streamed so far; drop the bubble only if nothing
        // ever arrived. Never surfaced as an error -- the visitor chose to
        // stop, or the connection dropped after a partial answer.
        setMessages((prev) => finalizeAbortedStream(prev, pending.assistantPlaceholderId));
      } else if (message.type === "widget:error") {
        const pending = pendingRef.current.get(message.requestId);
        if (!pending) return;
        pendingRef.current.delete(message.requestId);
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        setIsAwaitingResponse(false);
        setIsStreaming(false);

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
      } else if (message.type === "widget:recent_chats_result") {
        setIsLoadingRecentChats(false);
        setRecentChats(message.conversations);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [strings]);

  const dispatchSend = useCallback((text: string, userMessageId: string, suggested = false) => {
    const requestId = newId();
    const assistantPlaceholderId = newId();

    // The whole-turn client deadline. On a streamed turn the first token
    // clears it (see the stream_delta handler); on a non-streaming turn
    // (human-control JSON) or a stream that never produces a token, it
    // fires and surfaces the error exactly as before. The id is stored so
    // the stream handlers can clear it.
    const timeoutId = setTimeout(() => {
      if (!pendingRef.current.has(requestId)) return;
      pendingRef.current.delete(requestId);
      setIsAwaitingResponse(false);
      setIsStreaming(false);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== assistantPlaceholderId)
          .map((m) => (m.id === userMessageId ? { ...m, status: "error", errorKind: "failure" } : m)),
      );
    }, RESPONSE_TIMEOUT_MS);

    pendingRef.current.set(requestId, { userMessageId, assistantPlaceholderId, text, timeoutId });

    setMessages((prev) => [...prev, { id: assistantPlaceholderId, role: "assistant", content: "" }]);
    setIsAwaitingResponse(true);
    setIsStreaming(true);
    postToParent({
      type: "widget:send",
      requestId,
      text,
      consentGiven: consentGivenRef.current,
      ...(suggested ? { suggested: true } : {}),
    });
  }, []);

  const sendMessage = useCallback(
    (rawText: string, options?: { suggested?: boolean }) => {
      const text = rawText.trim().slice(0, MAX_MESSAGE_LENGTH);
      // Double-submission guard: isAwaitingResponse covers the pre-token
      // wait, isStreaming covers the rest of a turn whose tokens are still
      // arriving. Neither a second send nor a retry can start mid-turn.
      if (!text || isAwaitingResponse || isStreaming || isCoolingDown) return;

      const userMessageId = newId();
      setMessages((prev) => [...prev, { id: userMessageId, role: "user", content: text }]);
      dispatchSend(text, userMessageId, options?.suggested === true);
    },
    [isAwaitingResponse, isStreaming, isCoolingDown, dispatchSend],
  );

  /** Visitor pressed stop: ask the loader to abort the in-flight fetch. The loader replies with widget:stream_aborted, which finalizes the partial answer. */
  const abort = useCallback(() => {
    for (const requestId of pendingRef.current.keys()) {
      postToParent({ type: "widget:abort", requestId });
    }
  }, []);

  const retryMessage = useCallback(
    (messageId: string) => {
      if (isAwaitingResponse || isStreaming || isCoolingDown) return;
      const target = messages.find((m) => m.id === messageId);
      if (!target || target.role !== "user") return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { id: m.id, role: "user", content: m.content } : m)),
      );
      dispatchSend(target.content, messageId);
    },
    [messages, isAwaitingResponse, isStreaming, isCoolingDown, dispatchSend],
  );

  const setConsent = useCallback((value: boolean) => {
    consentGivenRef.current = value;
    setConsentGiven(value);
  }, []);

  /** Phase 25d "start new chat": resets this widget instance's own state and tells the loader to clear its stored/in-memory conversation id. */
  const startNewChat = useCallback(() => {
    for (const pending of pendingRef.current.values()) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
    }
    pendingRef.current.clear();
    hasSucceededRef.current = false;
    conversationIdRef.current = null;
    setMessages([]);
    setIsAwaitingResponse(false);
    setIsStreaming(false);
    setIsCoolingDown(false);
    setPanelError(null);
    postToParent({ type: "widget:new_chat" });
  }, []);

  /** Phase 25d "view recent chats": asks the loader (the only context that can make the authorized fetch) for this visitor's past conversations. */
  const requestRecentChats = useCallback(() => {
    setIsLoadingRecentChats(true);
    setRecentChats(null);
    postToParent({ type: "widget:recent_chats_request" });
  }, []);

  /**
   * Phase 25d: picking a conversation from "view recent chats". Clears
   * this instance's own message list first -- by the time the loader's
   * "widget:restore" reply arrives, `messages` is already empty, so the
   * existing restore handler's "only apply if currently empty" rule
   * applies unchanged, even for a picked conversation with zero messages.
   */
  const switchConversation = useCallback((conversationId: string) => {
    for (const pending of pendingRef.current.values()) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
    }
    pendingRef.current.clear();
    hasSucceededRef.current = false;
    setMessages([]);
    setIsAwaitingResponse(false);
    setIsStreaming(false);
    setIsCoolingDown(false);
    setPanelError(null);
    postToParent({ type: "widget:switch_conversation", conversationId });
  }, []);

  return {
    messages,
    isAwaitingResponse,
    isStreaming,
    isCoolingDown,
    panelError,
    consentGiven,
    setConsentGiven: setConsent,
    sendMessage,
    abort,
    retryMessage,
    startNewChat,
    recentChats,
    isLoadingRecentChats,
    requestRecentChats,
    switchConversation,
  };
}
