"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { ConversationMessage } from "@/lib/rag";
import type { RecommendedItem } from "@/lib/tools/recommend-products";
import { renderWidgetMarkdown } from "@/lib/widget-markdown";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";
import { Badge } from "../badge";
import { Card, btnGhost, btnOutline, inputClass } from "../ui";
import { sendSandboxMessage, type SandboxMode } from "./actions";

type DisplayMessage = ConversationMessage & {
  id: string;
  failed?: boolean;
  recommendedProducts?: RecommendedItem[];
};

const SLOW_RESPONSE_NOTICE_MS = 12_000;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Sandbox test-chat workspace (Phase 25c "test your AI before
 * publishing"): calls the real AI pipeline via sendSandboxMessage()
 * scoped to the caller's own business -- no widget key, no public
 * embed required. Shared between /onboarding/test and
 * /dashboard/widget-settings so a business can re-test any time after
 * changing knowledge/products/FAQs, not only once during onboarding.
 */
export function SandboxChatPanel({ liveAvailable = false }: { /** True once the agent is published: shows the Draft / Live switch. */ liveAvailable?: boolean }) {
  const [mode, setMode] = useState<SandboxMode>("draft");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Widget reliability item 6: same scroll rules as the widget -- follow the
  // newest message at the bottom, a "New message" pill when scrolled up.
  const lastOwnMessageId = [...messages].reverse().find((m) => m.role === "user")?.id ?? null;
  const { containerRef, contentRef, onScroll, showNewMessagePill, scrollToBottom } = useStickToBottom(
    messages.length,
    lastOwnMessageId,
  );

  function handleModeChange(next: SandboxMode) {
    if (next === mode) return;
    setMode(next);
    handleStartNewChat();
  }

  function handleStartNewChat() {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    conversationIdRef.current = null;
    setMessages([]);
    setInput("");
    setError(null);
    setIsPending(false);
    setIsSlow(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isPending) return;

    const history: ConversationMessage[] = messages.map(({ role, content }) => ({ role, content }));
    const userMessage: DisplayMessage = { id: newId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsPending(true);
    setIsSlow(false);

    slowTimerRef.current = setTimeout(() => setIsSlow(true), SLOW_RESPONSE_NOTICE_MS);

    try {
      const result = await sendSandboxMessage(conversationIdRef.current, history, text, mode);
      if (result.ok) {
        conversationIdRef.current = result.conversationId;
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", content: result.answer, recommendedProducts: result.recommendedProducts },
        ]);
      } else {
        setMessages((prev) => prev.map((m) => (m.id === userMessage.id ? { ...m, failed: true } : m)));
        setError(result.error);
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === userMessage.id ? { ...m, failed: true } : m)));
      setError("Something went wrong reaching your AI. Please try again.");
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsPending(false);
      setIsSlow(false);
    }
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="dx-title">Test your agent</h2>
            {mode === "live" ? (
              <Badge tone="success" size="sm" title="This chat uses the version your visitors get.">
                Testing live
              </Badge>
            ) : (
              <Badge tone="accent" size="sm" title="This chat reads your draft, including changes you haven't published yet.">
                Testing draft
              </Badge>
            )}
          </div>
          <p className="text-sm text-ds-text-secondary">
            {mode === "live"
              ? "Ask a question a prospect might ask. This chat uses your published agent, exactly what visitors get, and is private to your setup."
              : "Ask a question a prospect might ask. This chat uses your current draft and is private to your setup."}
          </p>
          {liveAvailable ? (
            <div role="group" aria-label="Which version to test" className="mt-1 inline-flex w-fit rounded-xl border border-ds-border p-0.5">
              {(["draft", "live"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  disabled={isPending}
                  onClick={() => handleModeChange(option)}
                  className={`min-h-9 rounded-[10px] px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:opacity-50 ${
                    mode === option ? "bg-ds-primary text-ds-primary-on" : "text-ds-text-secondary hover:text-ds-text-primary"
                  }`}
                >
                  {option === "draft" ? "Draft" : "Live"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={handleStartNewChat}
            className={btnGhost + " min-h-11"}
          >
            Start new chat
          </button>
        ) : null}
      </div>

      <div className="relative">
      <div
        ref={containerRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Test conversation"
        className="flex max-h-80 min-h-32 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-ds-border bg-ds-bg p-3"
      >
        <div ref={contentRef} className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-sm text-ds-text-muted">
            Send a message below to see how your AI responds right now.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${
                  m.role === "user"
                    ? "ds-btn-label bg-ds-primary text-ds-primary-on"
                    : "bg-ds-surface text-ds-text-primary"
                } ${m.failed ? "border border-ds-danger" : ""}`}
              >
                {renderWidgetMarkdown(m.content)}
              </div>
              {m.recommendedProducts && m.recommendedProducts.length > 0 ? (
                <div className="flex max-w-[85%] flex-wrap gap-2">
                  {m.recommendedProducts.map((item) => (
                    <div
                      key={item.id}
                      className="flex w-40 flex-col gap-1 border border-ds-border bg-ds-surface p-2"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary business-supplied catalog image URL
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-20 w-full object-cover"
                        />
                      ) : null}
                      <span className="text-xs font-medium text-ds-text-primary">{item.name}</span>
                      {item.priceDisplay ? (
                        <span className="text-2xs text-ds-text-secondary">{item.priceDisplay}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {m.failed ? <span className="text-2xs text-ds-danger">Failed to send</span> : null}
            </div>
          ))
        )}
        {isPending ? (
          <p className="text-xs text-ds-text-muted" aria-live="polite">
            {isSlow ? "Still thinking, this can take up to 30 seconds…" : "Thinking…"}
          </p>
        ) : null}
        </div>
      </div>
      {showNewMessagePill ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 bg-ds-primary px-3 py-1.5 text-xs font-medium text-ds-primary-on shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary"
        >
          ↓ New message
        </button>
      ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="sandbox-chat-input" className="sr-only">
          Message to test
        </label>
        <input
          id="sandbox-chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isPending}
          placeholder="Ask what a prospect might ask…"
          maxLength={2000}
          aria-describedby="sandbox-chat-help"
          className={inputClass + " min-h-11 min-w-0 flex-1"}
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          aria-describedby="sandbox-chat-help"
          className={btnOutline + " min-h-11"}
        >
          {isPending ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : null}
          {isPending ? "Sending…" : "Send"}
        </button>
      </form>
      <p id="sandbox-chat-help" className="text-xs text-ds-text-secondary">Enter a message to send a test.</p>
    </Card>
  );
}
