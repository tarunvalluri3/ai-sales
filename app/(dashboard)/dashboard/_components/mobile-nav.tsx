"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NavList, SidebarBrand } from "./sidebar";
import { useFocusTrap } from "./use-focus-trap";

const PANEL_ID = "dashboard-mobile-nav";

/**
 * Below `md` the sidebar is replaced by this menu button (rendered at the
 * start of the dashboard header) and a slide-over drawer holding the same
 * `NavList` the desktop sidebar renders.
 */
export function MobileNav({ businessName }: { businessName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const panelRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        onClick={() => setIsOpen((open) => !open)}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-text-primary transition-colors hover:bg-ds-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {isOpen ? <X strokeWidth={1.75} className="size-5" aria-hidden="true" /> : <Menu strokeWidth={1.75} className="size-5" aria-hidden="true" />}
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 rounded-none bg-ds-scrim"
          />
          <nav
            id={PANEL_ID}
            ref={panelRef as React.RefObject<HTMLElement>}
            aria-label="Dashboard, mobile"
            aria-modal="true"
            role="dialog"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-ds-border bg-ds-surface px-3 py-6"
          >
            <SidebarBrand businessName={businessName} />
            <div className="flex flex-col">
              <NavList onNavigate={() => setIsOpen(false)} />
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
