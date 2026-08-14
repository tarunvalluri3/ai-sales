"use client";

import { useRef, useState } from "react";

const MAX_MESSAGE_LENGTH = 2000;
const COUNTER_THRESHOLD = MAX_MESSAGE_LENGTH - 200;

export function Composer({
  onSend,
  disabled,
  autoFocus,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  autoFocus: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value.slice(0, MAX_MESSAGE_LENGTH));
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <div className="border-t border-widget-border bg-widget-surface px-3 py-3">
      {value.length >= COUNTER_THRESHOLD ? (
        <p className="mb-1 text-right text-xs text-widget-muted">
          {value.length}/{MAX_MESSAGE_LENGTH}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={1}
          aria-label="Message input"
          placeholder="Type a message…"
          className="max-h-[120px] flex-1 resize-none rounded-xl border border-widget-border bg-widget-surface-elevated px-3 py-2 text-[15px] text-widget-foreground outline-none placeholder:text-widget-muted focus-visible:border-widget-border-strong focus-visible:ring-2 focus-visible:ring-widget-primary disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send message"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-widget-primary text-widget-on-primary transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12L20 4L14 20L11 13L4 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
