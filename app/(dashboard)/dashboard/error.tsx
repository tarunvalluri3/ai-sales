"use client";

import { useEffect } from "react";
import { ErrorState } from "./_components/state-views";

/**
 * Segment-wide error boundary (Phase 25c): Next.js wraps every nested
 * dashboard page's page.js and layout.js in this boundary, so one file
 * here covers a page-load failure (e.g. requireBusinessContext()/a
 * list*ForBusiness() call throwing) on every dashboard route -- there
 * was previously no error boundary for the initial data fetch at all,
 * only for user-triggered actions (lib/errors.ts's logAndGetUserMessage).
 * `retry` is Next 16's renamed prop (was `reset` pre-16).
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col bg-ds-bg p-6">
      <ErrorState onRetry={retry} />
    </div>
  );
}
