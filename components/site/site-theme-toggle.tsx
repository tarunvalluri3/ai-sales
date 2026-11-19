"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Light / dark switch for the public site. Stored as "site-theme" (separate
 * from the dashboard's "theme"). Both icons render; CSS shows the right one,
 * so there is no state and no hydration mismatch. First paint is handled by
 * THEME_INIT_SCRIPT.
 */
export function SiteThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-site-theme") === "dark" ? "light" : "dark";
    if (next === "dark") root.setAttribute("data-site-theme", "dark");
    else root.removeAttribute("data-site-theme");
    try {
      localStorage.setItem("site-theme", next);
    } catch {
      // Storage can be blocked; the theme still applies for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className={`inline-flex size-[38px] shrink-0 items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-text-secondary transition-colors hover:border-ds-border-strong hover:text-ds-text-primary ${className}`}
    >
      <Moon className="site-theme-moon size-4" strokeWidth={1.8} aria-hidden="true" />
      <Sun className="site-theme-sun size-4" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
