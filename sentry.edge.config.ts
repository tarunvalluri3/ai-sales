import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * Edge runtime error tracking (proxy.ts's clerkMiddleware()) -- Phase 21.
 * Loaded by instrumentation.ts's register() for the edge runtime only.
 * See sentry.server.config.ts for the tracesSampleRate/PII rationale.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
