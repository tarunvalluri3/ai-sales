"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, Show, UserButton } from "@clerk/nextjs";
import { clerkDarkCompactAppearance } from "@/lib/clerk-appearance";

/**
 * The single root layout (`app/(dashboard)/layout.tsx`) covers the public
 * homepage, auth pages, onboarding, and the authenticated dashboard alike.
 * Each needs a different header treatment, so this reads the path and
 * renders one of three variants rather than one generic bar everywhere.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const isAuthFlow =
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/session-tasks");

  if (isDashboard) {
    return (
      <header className="flex items-center justify-end gap-3 border-b border-ds-border bg-ds-surface px-4 py-2.5">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          appearance={clerkDarkCompactAppearance}
        />
        <UserButton appearance={clerkDarkCompactAppearance} />
      </header>
    );
  }

  if (isAuthFlow) {
    return (
      <header className="flex items-center justify-center border-b border-ds-border bg-ds-bg px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ds-text-primary">
          <span className="size-2 rounded-full bg-ds-accent" aria-hidden="true" />
          AI Sales
        </Link>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between border-b border-ds-border bg-ds-bg px-6 py-4">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ds-text-primary">
        <span className="size-2 rounded-full bg-ds-accent" aria-hidden="true" />
        AI Sales
      </Link>
      <div className="flex items-center gap-5">
        <Show when="signed-out">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-ds-text-secondary transition-colors hover:text-ds-text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong"
          >
            Get started
          </Link>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="rounded-ds-sm bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-accent-on transition-colors hover:bg-ds-accent-strong"
          >
            Go to dashboard
          </Link>
          <UserButton appearance={clerkDarkCompactAppearance} />
        </Show>
      </div>
    </header>
  );
}
