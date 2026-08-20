import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * Browser error tracking (Phase 21). Deliberately no session-replay
 * integration -- this app's dashboard and widget both render real
 * tenant business data and real prospect conversations; recording the
 * screen is a PII risk this phase's "PII-scrubbed" requirement rules
 * out by default rather than something to opt into casually later.
 * See sentry.server.config.ts for the tracesSampleRate rationale.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
