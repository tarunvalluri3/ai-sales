"use client";

import { usePathname } from "next/navigation";

/**
 * Dashboard sections whose pages edit the agent (Draft -> Publish -> Live).
 * Business hours, billing, channels' connection settings, leads and the like
 * are operational and take effect immediately, so they are deliberately not
 * listed. A path matches the section itself and anything beneath it
 * (e.g. /dashboard/faqs/new, /dashboard/products/<id>/edit).
 */
const DRAFT_SECTIONS = [
  "/dashboard/profile",
  "/dashboard/products",
  "/dashboard/services",
  "/dashboard/faqs",
  "/dashboard/knowledge",
  "/dashboard/widget-settings",
];

/**
 * The subtle inline note shown on every editing page. Rendered once, from the
 * dashboard layout, rather than copied into each page; a client component only
 * because a server layout cannot read the pathname.
 */
export function DraftNote() {
  const pathname = usePathname();
  const isEditingPage = DRAFT_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));
  if (!isEditingPage) return null;

  return (
    <p role="note" className="border-b border-ds-border bg-ds-bg px-6 py-2 text-xs text-ds-text-muted">
      Changes save as a draft. Customers see them after you publish.
    </p>
  );
}
