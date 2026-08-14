/**
 * Runs once when a new Next.js server instance starts, before it accepts
 * any request (stable since Next.js 15, no config flag needed -- confirmed
 * against node_modules/next/dist/docs/.../instrumentation.md). Used here
 * only to trigger lib/env.ts's startup env-var validation, so a missing
 * required secret fails the server at boot instead of at first request
 * (docs/security.md §5). Guarded to the Node runtime -- the Edge runtime
 * (proxy.ts's clerkMiddleware()) never touches these server secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  await import("@/lib/env");
}
