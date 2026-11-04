import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";
import { sentryEnvironment, sentryTracesSampleRate } from "@/lib/sentry-config";

/**
 * Node runtime error tracking (Phase 21, STATE.md / docs/phases.md).
 * Loaded by instrumentation.ts's register(), not imported directly
 * anywhere else. Performance tracing is deliberately off
 * (tracesSampleRate: 0) -- Phase 21 builds its own AI latency/cost
 * metrics separately (lib/ai-metrics.ts), and enabling Sentry's own
 * tracing would double-count spend against the free-tier transaction
 * quota for no added value here. Production readiness: still 0 by default,
 * but SENTRY_TRACES_SAMPLE_RATE (0-1) can enable a small sample
 * (lib/sentry-config.ts), and events carry the resolved environment.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Off unless SENTRY_TRACES_SAMPLE_RATE is set (lib/sentry-config.ts).
  tracesSampleRate: sentryTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  environment: sentryEnvironment(process.env),
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
