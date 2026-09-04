"use client";

import { useEffect, useRef, useState } from "react";
import type { WidgetStrings } from "@/lib/widget-i18n";

export function PanelHeader({
  businessName,
  logoUrl,
  strings,
  onClose,
  onStartNewChat,
  onEndChat,
  onViewRecentChats,
}: {
  businessName: string;
  logoUrl: string | null;
  strings: WidgetStrings;
  onClose: () => void;
  onStartNewChat: () => void;
  onEndChat: () => void;
  onViewRecentChats: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape closes the menu first, before the panel-level Escape handler
  // (panel.tsx) gets a chance to close the whole panel -- capture phase
  // so this runs ahead of that document-level listener, which is
  // attached in the bubble phase.
  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsMenuOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isMenuOpen]);

  function runAndClose(action: () => void) {
    setIsMenuOpen(false);
    action();
  }

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-white/10 bg-widget-header-bg px-4 py-3.5 text-widget-header-fg">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-widget-primary text-widget-on-primary">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary business-supplied URL, not a local/known asset next/image can optimize
            <img src={logoUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3a1 1 0 0 1 1 1v1.07A6 6 0 0 1 18.93 11H20a1 1 0 1 1 0 2h-1.07A6 6 0 0 1 13 18.93V20a1 1 0 1 1-2 0v-1.07A6 6 0 0 1 5.07 13H4a1 1 0 1 1 0-2h1.07A6 6 0 0 1 11 5.07V4a1 1 0 0 1 1-1Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                fill="currentColor"
              />
            </svg>
          )}
          <span
            aria-hidden="true"
            className="widget-status-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-widget-header-bg bg-widget-primary"
          />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{businessName || strings.panelTitle}</span>
          <span className="truncate text-[11px] text-widget-header-fg-muted">{strings.panelSubtitle}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label={strings.menuLabel}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="5" cy="12" r="1.75" fill="currentColor" />
              <circle cx="12" cy="12" r="1.75" fill="currentColor" />
              <circle cx="19" cy="12" r="1.75" fill="currentColor" />
            </svg>
          </button>
          {isMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[52px] z-10 w-52 overflow-hidden rounded-xl border border-widget-border-strong bg-widget-surface py-1 text-widget-foreground shadow-xl shadow-black/20"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(onStartNewChat)}
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-widget-assistant-bubble"
              >
                {strings.startNewChatLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(onViewRecentChats)}
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-widget-assistant-bubble"
              >
                {strings.viewRecentChatsLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(onEndChat)}
                className="block w-full px-3.5 py-2 text-left text-sm hover:bg-widget-assistant-bubble"
              >
                {strings.endChatLabel}
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={strings.closeChatLabel}
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-widget-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
