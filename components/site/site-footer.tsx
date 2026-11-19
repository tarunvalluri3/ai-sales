"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, MapPin, Phone } from "lucide-react";
import { WavesLogo } from "@/app/(dashboard)/_components/waves-logo";
import { GENERAL_EMAIL, PHONE_PRIMARY, PHONE_WHATSAPP, SUPPORT_EMAIL } from "@/lib/site-contact";
import { WhatsAppIcon } from "./brand-icons";
import { FOOTER_COLUMNS } from "./nav-data";

/*
 * Site-wide footer for every public page (home, product, legal, contact).
 * Rendered once from the root layout; returns nothing on the dashboard,
 * onboarding, /apache and the auth flow -- the same path rules as
 * SiteHeader, so the two can't disagree about what is "public".
 *
 * Company facts (legal name, GSTIN, Udyam, address) are the registered
 * ones, shown as text -- Razorpay, Meta and grant reviewers look for them.
 */

export function isPublicSitePath(pathname: string | null): boolean {
  if (!pathname) return true;
  return !(
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/apache") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/session-tasks") ||
    pathname.startsWith("/suspended")
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (!isPublicSitePath(pathname)) return null;

  return (
    <footer className="band-dark relative overflow-hidden px-5 pb-10 pt-20 sm:px-8 lg:px-12">
      <div aria-hidden="true" className="site-glow -top-40 left-1/2 h-[320px] w-[720px] -translate-x-1/2 opacity-[0.18]" />
      <div className="relative mx-auto max-w-[1280px]">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr] lg:gap-16">
          <div>
            <Link href="/" aria-label="Waves AI Pilot home" className="inline-flex">
              <WavesLogo tone="dark" />
            </Link>
            <p className="mt-5 max-w-[340px] text-[15px] leading-relaxed text-ds-text-secondary">
              An AI sales employee that answers, qualifies and books your prospects on your website, WhatsApp and
              Instagram, using only what your business approves.
            </p>
            <ul className="mt-7 flex flex-col gap-3 text-[14px] text-ds-text-secondary">
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                <span>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-ds-text-primary">
                    {SUPPORT_EMAIL}
                  </a>
                  <span className="text-ds-text-muted"> · </span>
                  <a href={`mailto:${GENERAL_EMAIL}`} className="transition-colors hover:text-ds-text-primary">
                    {GENERAL_EMAIL}
                  </a>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                <a href={PHONE_PRIMARY.tel} className="transition-colors hover:text-ds-text-primary">
                  {PHONE_PRIMARY.display}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <WhatsAppIcon className="size-4 shrink-0" />
                <a href={PHONE_WHATSAPP.whatsapp} className="transition-colors hover:text-ds-text-primary">
                  {PHONE_WHATSAPP.display} <span className="text-ds-text-muted">(WhatsApp)</span>
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ds-text-muted" aria-hidden="true" />
                <span>Plot No. 19, Venkatramana Colony, Dammaiguda, Hyderabad, Telangana 500083, India</span>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="font-label text-[11px] font-medium uppercase tracking-[0.18em] text-ds-text-muted">
                  {col.title}
                </p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[14px] text-ds-text-secondary transition-colors hover:text-ds-text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-ds-border pt-8 text-[12.5px] leading-relaxed text-ds-text-muted lg:flex-row lg:items-center lg:justify-between">
          <p>
            © 2026 Waves Web Studio. Waves AI Pilot is a product of{" "}
            <a href="https://waveswebstudio.in" className="text-ds-text-secondary hover:text-ds-text-primary">
              Waves Web Studio
            </a>
            , Hyderabad, India.
          </p>
          <p className="font-label tracking-[0.04em]">
            GSTIN 36BYQPT2686E1ZR · MSME (Udyam) UDYAM-TS-20-0221187
          </p>
        </div>
      </div>
    </footer>
  );
}
