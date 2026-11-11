"use client";

import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "theme";

/**
 * Flips <html data-theme> between dark (default) and light and remembers the
 * choice. Both icons render and CSS (`.ds-theme-sun` / `.ds-theme-moon` in
 * globals.css) shows the right one, so there is no state and no hydration
 * mismatch. The first-paint theme is set by THEME_INIT_SCRIPT in layout.tsx.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the theme still applies for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      className={`inline-flex size-10 items-center justify-center border border-ds-border text-ds-text-secondary transition-colors duration-200 hover:border-ds-text-primary hover:text-ds-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-text-primary ${className}`}
    >
      <Sun className="ds-theme-sun size-4" strokeWidth={2} strokeLinecap="square" aria-hidden="true" />
      <Moon className="ds-theme-moon size-4" strokeWidth={2} strokeLinecap="square" aria-hidden="true" />
    </button>
  );
}
