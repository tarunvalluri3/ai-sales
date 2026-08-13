import type { Metadata } from "next";
import { WidgetApp } from "./_components/widget-app";

/**
 * This page carries a live, per-business widget key in its query string
 * (docs/security.md §4 -- not a secret, but no reason to let it be
 * indexed/cached by search engines).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WidgetEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; position?: string }>;
}) {
  const { key } = await searchParams;

  if (!key) {
    return null;
  }

  return <WidgetApp />;
}
