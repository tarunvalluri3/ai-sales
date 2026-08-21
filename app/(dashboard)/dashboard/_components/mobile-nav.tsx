"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive, formatAttentionBadge } from "./nav-items";
import { useAttentionCount } from "./attention-provider";
import { useFocusTrap } from "./use-focus-trap";

const PANEL_ID = "dashboard-mobile-nav";

export function MobileNav({ businessName }: { businessName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const attentionCount = useAttentionCount();
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
      <div className="flex items-center justify-between border-b border-ds-border bg-ds-surface px-4 py-3">
        <p className="truncate text-sm font-semibold text-ds-text-primary">{businessName}</p>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={PANEL_ID}
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setIsOpen((open) => !open)}
          className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface-soft hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {isOpen ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
              <path
                d="M5 5l10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <nav
            id={PANEL_ID}
            ref={panelRef as React.RefObject<HTMLElement>}
            aria-label="Dashboard, mobile"
            aria-modal="true"
            role="dialog"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-1 overflow-y-auto border-r border-ds-border bg-ds-surface p-4 shadow-xl"
          >
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const showBadge = item.href === "/dashboard/conversations" && attentionCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-ds-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent ${
                    active
                      ? "bg-dashboard-primary text-dashboard-on-primary"
                      : "text-ds-text-secondary hover:bg-ds-surface-soft hover:text-ds-text-primary"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge ? (
                    <span
                      aria-label={`${attentionCount} conversation${attentionCount === 1 ? "" : "s"} need attention`}
                      className="rounded-full bg-ds-warning px-1.5 py-0.5 text-2xs font-semibold text-ds-bg"
                    >
                      {formatAttentionBadge(attentionCount)}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}
    </div>
  );
}
