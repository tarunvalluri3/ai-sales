import { DashboardLoadingSkeleton } from "./_components/state-views";

/**
 * Next.js's loading.tsx convention -- automatically shown as a Suspense
 * fallback while any /dashboard/* route's server component is fetching
 * data, including on navigation between pages (e.g. into a page you
 * haven't visited yet). Fixes the "did anything happen?" gap on
 * navigation that made a newly-added page like Availability easy to
 * miss.
 */
export default function DashboardLoading() {
  return <DashboardLoadingSkeleton />;
}
