"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";
import { WavesLogo } from "@/app/(dashboard)/_components/waves-logo";
import { INDUSTRIES, PRIMARY_NAV, PRODUCT_FEATURES, USE_CASES, type NavEntry } from "./nav-data";

/*
 * Public site header. Rendering it is also what turns the light site theme
 * on: `.site-shell` here is the hook site.css keys every token off, so only
 * pages that show this header (marketing, legal, contact) are themed.
 *
 * Desktop: Product and Solutions open mega menus on hover or click (and on
 * keyboard focus via the button); Escape and outside-click close them.
 * Mobile: one drawer, the two menus as accordions.
 */

type MenuKey = "product" | "solutions";

function MenuItem({ item, onNavigate }: { item: NavEntry; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-ds-surface-soft"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-ds-border bg-ds-surface text-ds-text-primary transition-colors group-hover:border-ds-border-strong group-hover:bg-ds-lime-soft">
        <Icon className="size-[17px]" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-tight text-ds-text-primary">{item.label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ds-text-muted">{item.description}</span>
      </span>
    </Link>
  );
}

function ProductMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid w-[860px] grid-cols-[1fr_250px] gap-2 p-2">
      <div className="grid grid-cols-2 gap-0.5 p-2">
        <p className="col-span-2 px-2.5 pb-2 font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-faint">
          Platform
        </p>
        {PRODUCT_FEATURES.map((item) => (
          <MenuItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="flex flex-col justify-between rounded-2xl bg-[#151713] p-5 text-white">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-white/50">Platform tour</p>
          <p className="mt-3 text-[17px] leading-snug">One AI employee for your website, WhatsApp and Instagram.</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/60">
            See every feature with real screens from the dashboard.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/product"
            onClick={onNavigate}
            className="inline-flex items-center gap-2 text-[14px] font-medium text-[#b2ff38]"
          >
            Explore the platform <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/security"
            onClick={onNavigate}
            className="inline-flex items-center gap-2 text-[13px] text-white/70 hover:text-white"
          >
            <ShieldCheck className="size-4" aria-hidden="true" /> Security &amp; trust
          </Link>
        </div>
      </div>
    </div>
  );
}

function SolutionsMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid w-[780px] grid-cols-[1.35fr_1fr] gap-2 p-2">
      <div className="p-2">
        <p className="px-2.5 pb-2 font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-faint">
          By industry
        </p>
        <div className="grid gap-0.5">
          {INDUSTRIES.map((item) => (
            <MenuItem key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <div className="flex flex-col rounded-2xl bg-ds-surface-soft p-2">
        <p className="px-2.5 pb-2 pt-2 font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-faint">
          By goal
        </p>
        <div className="grid gap-0.5">
          {USE_CASES.map((item) => (
            <MenuItem key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
        <Link
          href="/solutions"
          onClick={onNavigate}
          className="mx-2.5 mb-2 mt-auto inline-flex items-center gap-2 pt-4 text-[14px] font-medium text-ds-accent"
        >
          All solutions <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawerOpen = drawerFor !== null && drawerFor === pathname;
  const [mobileSection, setMobileSection] = useState<MenuKey | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menus close on Escape, outside click, and on navigating (every menu
  // link calls `close`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setDrawerFor(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  // Lock page scroll behind the mobile drawer.
  useEffect(() => {
    document.documentElement.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [drawerOpen]);

  const openMenu = (key: MenuKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(key);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };
  const close = () => setOpen(null);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="site-shell sticky top-0 z-50">
      <div
        className={`border-b transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled || open || drawerOpen
            ? "border-ds-border bg-[rgba(246,247,245,0.86)] shadow-[0_8px_30px_-20px_rgba(21,23,19,0.25)] backdrop-blur-xl"
            : "border-transparent bg-[rgba(246,247,245,0.6)] backdrop-blur-md"
        }`}
      >
        <div ref={navRef} className="relative mx-auto flex h-[68px] max-w-[1280px] items-center gap-8 px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Waves AI Pilot home" className="flex items-center">
            <WavesLogo tone="light" />
          </Link>

          <nav aria-label="Main" className="hidden h-full items-center gap-1 lg:flex">
            {PRIMARY_NAV.map((item) =>
              item.menu ? (
                <div
                  key={item.label}
                  className="flex h-full items-center"
                  onMouseEnter={() => openMenu(item.menu)}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    aria-expanded={open === item.menu}
                    aria-controls={`menu-${item.menu}`}
                    onClick={() => setOpen(open === item.menu ? null : item.menu)}
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-[14.5px] transition-colors hover:text-ds-text-primary ${
                      isActive(item.href) || open === item.menu ? "text-ds-text-primary" : "text-ds-text-secondary"
                    }`}
                  >
                    {item.label}
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-300 ${open === item.menu ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id={`menu-${item.menu}`}
                    data-open={open === item.menu}
                    className="site-menu absolute left-1/2 top-[calc(100%-8px)] pt-2"
                  >
                    <div className="overflow-hidden rounded-[22px] border border-ds-border bg-ds-surface shadow-[0_30px_80px_-30px_rgba(21,23,19,0.4)]">
                      {item.menu === "product" ? <ProductMenu onNavigate={close} /> : <SolutionsMenu onNavigate={close} />}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-[14.5px] transition-colors hover:text-ds-text-primary ${
                    isActive(item.href) ? "text-ds-text-primary" : "text-ds-text-secondary"
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <AuthActions />
          </div>

          <button
            type="button"
            onClick={() => setDrawerFor(drawerOpen ? null : pathname)}
            aria-expanded={drawerOpen}
            aria-controls="site-drawer"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            className="ml-auto flex size-10 items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-text-primary lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-5">
              {drawerOpen ? (
                <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          id="site-drawer"
          className="fixed inset-x-0 bottom-0 top-[68px] overflow-y-auto border-t border-ds-border bg-ds-bg px-5 pb-10 pt-3 sm:px-8 lg:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {PRIMARY_NAV.map((item) =>
              item.menu ? (
                <div key={item.label} className="border-b border-ds-border">
                  <button
                    type="button"
                    aria-expanded={mobileSection === item.menu}
                    onClick={() => setMobileSection(mobileSection === item.menu ? null : item.menu)}
                    className="flex w-full items-center justify-between py-4 text-[17px] text-ds-text-primary"
                  >
                    {item.label}
                    <ChevronDown
                      className={`size-4 transition-transform duration-300 ${mobileSection === item.menu ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="site-accordion" data-open={mobileSection === item.menu}>
                    <div>
                      <div className="grid gap-0.5 pb-4">
                        {(item.menu === "product" ? PRODUCT_FEATURES : [...INDUSTRIES, ...USE_CASES]).map((entry) => (
                          <MenuItem key={entry.href} item={entry} onNavigate={() => setDrawerFor(null)} />
                        ))}
                        <Link
                          href={item.href}
                          onClick={() => setDrawerFor(null)}
                          className="mt-2 inline-flex items-center gap-2 px-2.5 text-[14px] font-medium text-ds-accent"
                        >
                          {item.menu === "product" ? "Platform overview" : "All solutions"}
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setDrawerFor(null)}
                  className="border-b border-ds-border py-4 text-[17px] text-ds-text-primary"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="mt-6 flex flex-col gap-3">
            <AuthActions stacked />
          </div>
        </div>
      ) : null}
    </header>
  );
}

function AuthActions({ stacked = false }: { stacked?: boolean }) {
  const full = stacked ? "w-full" : "";
  return (
    <>
      <Show when="signed-out">
        <Link href="/sign-in" className={`site-btn site-btn-secondary site-btn-sm ${full} ${stacked ? "" : "border-transparent bg-transparent"}`}>
          Sign in
        </Link>
        <Link href="/sign-up" className={`site-btn site-btn-primary site-btn-sm ${full}`}>
          Start free trial
          <span aria-hidden="true" className="site-btn-dot" />
        </Link>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className={`site-btn site-btn-primary site-btn-sm ${full}`}>
          Go to dashboard
        </Link>
        <UserButton appearance={clerkDarkCompactAppearance} />
      </Show>
    </>
  );
}
