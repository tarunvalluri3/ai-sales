"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";
import { WavesLogo } from "./waves-logo";

const MENU_ID = "site-nav-menu";

/**
 * Public marketing nav. Deliberately three items: these are the pages a
 * prospect decides on. The legal and policy routes (`/privacy`, `/terms`,
 * `/refunds`, `/shipping`) stay in the homepage footer, where the gateway's
 * activation check and anyone looking for them expects to find them --
 * promoting them into the header would bury the three that sell.
 */
const PUBLIC_NAV: { label: string; href: string }[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * The single root layout (`app/(dashboard)/layout.tsx`) covers the public
 * homepage, auth pages, onboarding, and the authenticated dashboard alike.
 * Each needs a different header treatment, so this reads the path and
 * renders one of three variants rather than one generic bar everywhere.
 */
export function SiteHeader() {
  const pathname = usePathname();
  // The menu is open only for the path it was opened on, so navigating
  // closes it without an effect that resets state.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const isMenuOpen = menuOpenedAt !== null && menuOpenedAt === pathname;

  // Phase 33 (docs/phases.md): /apache (the platform-admin panel) renders
  // its own header (app/(dashboard)/apache/_components/header.tsx) exactly
  // like /dashboard does, for the same reason -- grouped here so neither
  // branch below needs to know it exists twice. The onboarding wizard
  // (2026-10-29 redesign) joined this group for the same reason: its own
  // `WizardShell` top bar (logo + autosave indicator + account menu, no
  // dashboard link) replaces the generic centered-logo bar this file used
  // to render for it.
  const isDashboard =
    pathname?.startsWith("/dashboard") || pathname?.startsWith("/apache") || pathname?.startsWith("/onboarding");
  const isAuthFlow =
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/session-tasks");

  // Hooks run before the early returns below, as they must.
  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpenedAt(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  // Marketing pages only: the header is solid at every scroll position --
  // a fully transparent top state was tried and reverted (2026-10-28) after
  // it left the logo and nav links sitting directly on the ambient dot-grid
  // background with no solid surface behind them, reading as washed-out and
  // low-contrast against the rest of the page. Scrolling now only adds a
  // slightly stronger border and a soft shadow, never changes the fill.
  //
  // The initial value must still be `false` on both server and client --
  // reading `window.scrollY` in the `useState` initializer diverges between
  // the server render (always 0, no window) and a client mount that starts
  // already scrolled (back/forward navigation, an anchor link, scroll
  // restoration), which React flags as a hydration mismatch. A
  // `useLayoutEffect` instead corrects the value synchronously before the
  // browser paints, so a page opened mid-scroll never shows the wrong state
  // even for one frame.
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    if (isDashboard || isAuthFlow) return;

    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isDashboard, isAuthFlow]);

  // The dashboard renders its own header from dashboard/layout.tsx
  // (dashboard-header.tsx), so that the notification bell sits inside
  // AttentionProvider and can read the unread count from the existing poll.
  // This layout is shared with the marketing and auth pages, which must not
  // mount that business-scoped provider -- see dashboard-header.tsx's comment.
  if (isDashboard) {
    return null;
  }

  if (isAuthFlow) {
    return (
      <header className="flex items-center justify-center border-b border-ds-border bg-ds-bg px-4 py-4">
        {/* No `collapseNameOnMobile` here: this header is centred and holds
            nothing else, so the name has room at every width. No nav either
            -- someone mid sign-up should not be offered three ways out. */}
        <Link href="/" className="flex items-center">
          <WavesLogo />
        </Link>
      </header>
    );
  }

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-ds-bg transition-shadow duration-200 ${
        scrolled ? "border-ds-border-strong shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)]" : "border-ds-border"
      }`}
    >
      <div className="flex items-center gap-7 px-6 py-4">
        {/* The nav and the auth pair compete for width here, so the name
            drops out below 480px per the logo system's navbar rule. */}
        <Link href="/" className="flex items-center">
          <WavesLogo collapseNameOnMobile />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {PUBLIC_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm font-medium transition-colors hover:text-ds-text-primary ${
                  active ? "text-ds-text-primary" : "text-ds-text-secondary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-5 md:flex">
          <AuthActions />
        </div>

        {/* Below md the nav and auth actions move into the panel underneath.
            That panel is rendered inline, in document order, rather than as
            an overlay -- so it needs no focus trap and tabs naturally. */}
        <button
          type="button"
          onClick={() => setMenuOpenedAt(isMenuOpen ? null : pathname)}
          aria-expanded={isMenuOpen}
          aria-controls={MENU_ID}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-surface hover:text-ds-text-primary md:hidden"
        >
          {isMenuOpen ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {isMenuOpen ? (
        <div id={MENU_ID} className="flex flex-col border-t border-ds-border px-4 py-2 md:hidden">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`rounded-ds-sm px-2 py-2.5 text-sm font-medium transition-colors hover:bg-ds-surface hover:text-ds-text-primary ${
                pathname === item.href ? "text-ds-text-primary" : "text-ds-text-secondary"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-ds-border pt-3 pb-1">
            <AuthActions stacked />
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The same two signed-out / signed-in pairs in both the desktop row and the
 * mobile panel. `stacked` only changes padding and alignment -- keeping one
 * component means the two can't drift apart as the auth states change.
 */
function AuthActions({ stacked = false }: { stacked?: boolean }) {
  const primary = `rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong${
    stacked ? " text-center" : ""
  }`;
  const quiet = `text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary${
    stacked ? " px-2 py-2.5" : ""
  }`;

  return (
    <>
      <Show when="signed-out">
        <Link href="/sign-in" className={quiet}>
          Sign in
        </Link>
        <Link href="/sign-up" className={primary}>
          Get started
        </Link>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className={primary}>
          Go to dashboard
        </Link>
        <UserButton appearance={clerkDarkCompactAppearance} />
      </Show>
    </>
  );
}
