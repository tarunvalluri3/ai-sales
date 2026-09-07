"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Overflow ("more actions") menu for a knowledge-document row. Distills
 * the row's action set (2026-09-08 distill pass, following the same-day
 * critique's P1: "action row can show up to 6 simultaneous controls") down
 * to one always-visible primary action (rendered by the caller, outside
 * this component) plus this single trigger for everything else --
 * Refresh, Extract, Unpublish, Edit (when it isn't already primary), and
 * Delete. Each menu item stays a fully independent Server-Action-backed
 * button (see retry-ingestion-button.tsx etc.'s `variant="menuitem"`
 * styling); this component only owns open/close state and positioning,
 * matching the same escape/click-outside pattern already established by
 * `app/(widget)/widget/embed/_components/panel-header.tsx`'s menu.
 */
export function RowActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" fill="currentColor" />
          <circle cx="12" cy="12" r="1.75" fill="currentColor" />
          <circle cx="19" cy="12" r="1.75" fill="currentColor" />
        </svg>
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-10 w-64 overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface-elevated py-1 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
