import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * Node runtime error tracking (Phase 21, STATE.md / docs/phases.md).
 * Loaded by instrumentation.ts's register(), not imported directly
 * anywhere else. Performance tracing is deliberately off
 * (tracesSampleRate: 0) -- Phase 21 builds its own AI latency/cost
 * metrics separately (lib/ai-metrics.ts), and enabling Sentry's own
 * tracing would double-count spend against the free-tier transaction
 * quota for no added value here.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
