"use client";

import { usePathname } from "next/navigation";
import { Info } from "lucide-react";

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
 * The pale-lime note shown under the page title on every editing page.
 * Rendered by `PageHeader` (ui.tsx) rather than copied into each page; a
 * client component only because it reads the pathname to decide whether the
 * current section is draft-backed.
 */
export function DraftNote() {
  const pathname = usePathname();
  const isEditingPage = DRAFT_SECTIONS.some((section) => pathname === section || pathname.startsWith(`${section}/`));
  if (!isEditingPage) return null;

  return (
    <p role="note" className="flex items-center gap-3 rounded-2xl bg-ds-surface-soft px-4 py-3 text-xs text-ds-text-primary">
      <Info className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      Changes save as a draft. Customers see them after you publish.
    </p>
  );
}
