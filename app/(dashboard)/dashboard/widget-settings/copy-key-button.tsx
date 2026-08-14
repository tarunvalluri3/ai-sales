"use client";

import { useState } from "react";

/**
 * Pure UI sugar around the existing widget_key display value below --
 * copies the already-rendered key to the clipboard. Adds no new data,
 * no new server call, no new config option.
 */
export function CopyKeyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can fail (permissions, insecure context) --
      // fail silently, the key is still selectable/copyable by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className="flex shrink-0 items-center gap-1.5 rounded-ds-md border border-ds-border bg-ds-surface-elevated px-3 py-2.5 text-xs font-medium text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-50"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12.5L10 17.5L19 6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path
              d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}
