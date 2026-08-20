"use client";

import { useRef, useState } from "react";
import type { WidgetStrings } from "@/lib/widget-i18n";

const MAX_MESSAGE_LENGTH = 2000;
const COUNTER_THRESHOLD = MAX_MESSAGE_LENGTH - 200;

export function Composer({
  strings,
  onSend,
  disabled,
  autoFocus,
  consentGiven,
  onConsentChange,
}: {
  strings: WidgetStrings;
  onSend: (text: string) => void;
  disabled: boolean;
  autoFocus: boolean;
  consentGiven: boolean;
  onConsentChange: (value: boolean) => void;
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
      <label className="mb-2 flex items-start gap-2 text-xs leading-snug text-widget-muted">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(event) => onConsentChange(event.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-widget-primary"
        />
        <span>
          {strings.consentText}{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="underline hover:text-widget-foreground">
            {strings.consentLinkLabel}
          </a>
        </span>
      </label>
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
          aria-label={strings.inputPlaceholder}
          placeholder={strings.inputPlaceholder}
          className="max-h-[120px] flex-1 resize-none rounded-xl border border-widget-border bg-widget-surface-elevated px-3 py-2 text-[15px] text-widget-foreground outline-none placeholder:text-widget-muted focus-visible:border-widget-border-strong focus-visible:ring-2 focus-visible:ring-widget-primary disabled:opacity-60"
        />
        <button
          type="button"
          aria-label={strings.sendLabel}
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
