import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";
import { sentryEnvironment, sentryTracesSampleRate } from "@/lib/sentry-config";

/**
 * Edge runtime error tracking (proxy.ts's clerkMiddleware()) -- Phase 21.
 * Loaded by instrumentation.ts's register() for the edge runtime only.
 * See sentry.server.config.ts for the tracesSampleRate/PII rationale.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Off unless SENTRY_TRACES_SAMPLE_RATE is set (lib/sentry-config.ts).
  tracesSampleRate: sentryTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  environment: sentryEnvironment(process.env),
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
