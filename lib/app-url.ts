import "server-only";

/**
 * The app's own absolute base URL, for use **outside a request context**.
 *
 * Everywhere this app already needs its own origin inside a request --
 * the widget snippet builder on /dashboard/widget-settings -- it reads
 * `x-forwarded-proto`/`host` from the live request instead, deliberately
 * (see that page's own comment). That is still the right call there and
 * is not changed by this module.
 *
 * Email is the case that cannot do it: every sender in lib/notifications.ts
 * and lib/stalled-leads.ts runs from the daily cron or from an `after()`
 * continuation, where there is no request whose headers could be read. Two
 * of those emails previously hardcoded `https://ai-sales.vercel.app`, which
 * is wrong the moment production moves to its own domain -- and those two
 * links are the only path from an email back into the product.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_APP_URL` -- explicit override, set it when the app has
 *      a custom domain.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` -- set automatically by Vercel on
 *      every deployment, always pointing at the *production* domain (not
 *      the per-deployment preview URL, which `VERCEL_URL` gives and which
 *      would rot the moment that deployment is superseded).
 *   3. The previously hardcoded value, so behaviour is unchanged when
 *      neither is set. Deliberately not a guess at a real domain.
 */
const FALLBACK_APP_URL = "https://ai-sales.vercel.app";

export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    // Vercel supplies the bare host, no protocol.
    const withProtocol = vercelProduction.startsWith("http") ? vercelProduction : `https://${vercelProduction}`;
    return stripTrailingSlash(withProtocol);
  }

  return FALLBACK_APP_URL;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
