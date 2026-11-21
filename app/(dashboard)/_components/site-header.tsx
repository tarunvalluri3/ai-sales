"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site/site-nav";

/**
 * The single root layout (`app/(dashboard)/layout.tsx`) covers the public
 * site, auth pages, onboarding, and the authenticated dashboard alike.
 * Each needs a different header treatment, so this reads the path and
 * renders the marketing navigation where appropriate.
 *
 * Nov 2026 site redesign: the public variant is now `SiteNav`
 * (components/site/site-nav.tsx) -- mega menus for Product and Solutions,
 * and the hook that turns on the light site theme. Contact left the main
 * nav for the footer; the /contact page itself stays (Razorpay's website
 * check and Meta's review need it reachable).
 */
export function SiteHeader() {
  const pathname = usePathname();

  // Phase 33 (docs/phases.md): /apache (the platform-admin panel) renders
  // its own header (app/(dashboard)/apache/_components/header.tsx) exactly
  // like /dashboard does. The onboarding wizard (2026-10-29 redesign) joined
  // this group for the same reason: its own `WizardShell` top bar replaces
  // the generic bar.
  const isDashboard =
    pathname?.startsWith("/dashboard") || pathname?.startsWith("/apache") || pathname?.startsWith("/onboarding");
  const isAuthFlow =
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/session-tasks");

  // The dashboard renders its own header from dashboard/layout.tsx
  // (dashboard-header.tsx), so that the notification bell sits inside
  // AttentionProvider -- see dashboard-header.tsx's comment.
  if (isDashboard || isAuthFlow) {
    return null;
  }

  return <SiteNav />;
}
