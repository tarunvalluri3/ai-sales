"use client";

import { useEffect, useRef } from "react";

/**
 * Traps Tab/Shift+Tab focus inside a container while `active` is true, and
 * moves initial focus into it (Phase 25c accessibility pass). This chat
 * panel is a `role="dialog"` overlay but previously had no focus trap, so
 * Tab could escape to the host page behind it. A same-shaped hook lives at
 * app/(dashboard)/dashboard/_components/use-focus-trap.ts -- duplicated
 * rather than shared, matching this app's existing convention of keeping
 * the widget and dashboard client trees independent (see
 * app/(widget)/widget/embed/_lib/post-message.ts's own doc comment).
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;

    function getFocusable(): HTMLElement[] {
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return containerRef;
}
