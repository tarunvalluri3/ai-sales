import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { AdminSidebar } from "./_components/sidebar";
import { AdminMobileNav } from "./_components/mobile-nav";
import { AdminHeader } from "./_components/header";

/**
 * Phase 33 (docs/phases.md): the /apache platform-admin panel's root
 * layout. requirePlatformAdmin() here is the SECOND of the two mandatory
 * checks (proxy.ts runs the first, at the edge, for every /apache/**
 * request) -- this one runs again because a layout can be reached in ways
 * middleware's route matcher could miss in principle, and because every
 * Server Action under /apache repeats this same call independently
 * (AGENTS.md §2/§3: never trust a single layer).
 *
 * `noindex` + no sitemap entry (approved security brief, item 9): this
 * route is deliberately absent from app/sitemap.ts (never added there),
 * and robots metadata is set here so even a stray internal link can't get
 * it indexed.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function ApacheLayout({ children }: LayoutProps<"/apache">) {
  const { admin } = await requirePlatformAdmin("viewer");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminHeader />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <AdminSidebar role={admin.role} />
        <AdminMobileNav role={admin.role} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
