"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Blocks the dashboard until the business has an alert email.
 *
 * Why it is a blocking prompt and not a dismissable banner: `contact_email` is
 * the single address every business-facing email goes to -- the appointment
 * alert, the handover alert, the daily digest and every workflow email all
 * read this one column and return early without it. A business that never
 * sets it receives nothing, forever, with no symptom other than silence. That
 * is exactly how a real booking went unnoticed and started this work.
 *
 * Why a client component rather than a `redirect()` in the layout: a Next.js
 * server layout cannot read the current pathname, so it cannot exempt the
 * profile page and would redirect that page to itself forever. The decision
 * still comes from the server (`hasContactEmail` is read via
 * `requireBusinessContext()`), so this cannot be satisfied by anything the
 * client does -- only by saving a real address.
 *
 * `/dashboard/profile` is exempt because it is where the fix is made.
 */
const EXEMPT_PATHS = ["/dashboard/profile"];

export function ContactEmailGate({ hasContactEmail }: { hasContactEmail: boolean }) {
  const pathname = usePathname();

  if (hasContactEmail) return null;
  if (EXEMPT_PATHS.some((path) => pathname?.startsWith(path))) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-email-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ds-bg/80 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-ds-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 id="contact-email-gate-title" className="text-base font-semibold text-ds-text-primary">
              Add an alert email to continue
            </h2>
            <p className="text-sm text-ds-text-secondary">
              Nobody is being emailed when a prospect needs a human, books an appointment, or becomes a lead. Every alert this product
              sends goes to one address, and yours is empty.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          className="rounded-ds-sm bg-dashboard-primary px-4 py-2 text-center text-sm font-medium text-dashboard-on-primary transition-colors hover:bg-dashboard-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Add it on your business profile
        </Link>
      </div>
    </div>
  );
}
