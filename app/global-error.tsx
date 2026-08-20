"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Catches errors React itself can't recover from (root layout render
 * errors, uncaught exceptions outside any route's own error.tsx) --
 * Next.js's special top-level file, required to sit directly under
 * app/ regardless of the app's route groups (Phase 21). Replaces the
 * root layout entirely while active, so it defines its own <html>/
 * <body> rather than relying on either route group's layout.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#100f0c] px-6 text-center text-[#f5f3ec]">
        <div>
          <h1 className="text-lg font-medium">Something went wrong.</h1>
          <p className="mt-2 text-sm text-[#a8a496]">
            The error has been reported. Please try again.
          </p>
        </div>
      </body>
    </html>
  );
}
