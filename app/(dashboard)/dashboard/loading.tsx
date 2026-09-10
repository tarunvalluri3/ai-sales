/**
 * Next.js's loading.tsx convention -- automatically shown as a Suspense
 * fallback while any /dashboard/* route's server component is fetching
 * data, including on navigation between pages (e.g. into a page you
 * haven't visited yet). Fixes the "did anything happen?" gap on
 * navigation that made a newly-added page like Availability easy to
 * miss.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ds-bg p-6" role="status" aria-live="polite">
      <div className="size-8 animate-spin rounded-full border-2 border-ds-border border-t-ds-accent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
