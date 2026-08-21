"use client";

import { useRef, useState } from "react";
import type { ConversationMessage } from "@/lib/rag";
import { sendSandboxMessage } from "./actions";

type DisplayMessage = ConversationMessage & { id: string; failed?: boolean };

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
export function SandboxChatPanel() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const result = await sendSandboxMessage(conversationIdRef.current, history, text);
      if (result.ok) {
        conversationIdRef.current = result.conversationId;
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: result.answer }]);
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
    <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ds-text-primary">Test your AI</h2>
        <p className="text-sm text-ds-text-secondary">
          Chat with your AI sales employee exactly as a prospect would -- this uses your real
          products, services, FAQs, and knowledge, but nothing here is visible to prospects or
          counted as a real lead unless you say something that triggers a callback request.
        </p>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Test conversation"
        className="flex max-h-80 min-h-32 flex-col gap-3 overflow-y-auto rounded-ds-md border border-ds-border bg-ds-surface-elevated p-3"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-ds-text-muted">
            Send a message below to see how your AI responds right now.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-ds-md px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-ds-accent text-ds-accent-on"
                    : "bg-ds-surface text-ds-text-primary"
                } ${m.failed ? "border border-ds-danger" : ""}`}
              >
                {m.content}
              </div>
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
          className="flex-1 rounded-ds-sm border border-ds-border bg-ds-surface-elevated px-3 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-muted transition-colors focus:border-ds-border-strong focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="shrink-0 rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-medium text-ds-accent-on transition-colors hover:bg-ds-accent-strong disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
