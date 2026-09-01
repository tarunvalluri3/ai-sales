import type { Metadata } from "next";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { resolveBusinessBrandingFromWidgetKey } from "@/lib/widget-auth";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { getWidgetStrings } from "@/lib/widget-i18n";
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

  const branding = await resolveBusinessBrandingFromWidgetKey(key);
  if (!branding) {
    return null;
  }

  const strings = getWidgetStrings(branding.language);
  const supabase = createServiceSupabaseClient();
  const isOpenNow = await isWithinBusinessHours(supabase, branding.businessId);
  const greeting = isOpenNow
    ? branding.welcomeText ?? strings.defaultGreetingOpen
    : branding.welcomeTextClosed ?? strings.defaultGreetingClosed;

  return (
    <WidgetApp
      businessName={branding.businessName}
      language={branding.language}
      strings={strings}
      greeting={greeting}
      accentColor={branding.accentColor}
      logoUrl={branding.logoUrl}
      ctaText={branding.ctaText ?? strings.defaultCta}
      suggestedQuestions={branding.suggestedQuestions}
    />
  );
}
