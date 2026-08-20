import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when a new Next.js server instance starts, before it accepts
 * any request (stable since Next.js 15, no config flag needed -- confirmed
 * against node_modules/next/dist/docs/.../instrumentation.md). Two jobs:
 * lib/env.ts's startup env-var validation (Node runtime only -- the Edge
 * runtime's proxy.ts clerkMiddleware() never touches these server
 * secrets, docs/security.md §5), and Sentry init for whichever runtime
 * this instance is (Phase 21, STATE.md / docs/phases.md).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
