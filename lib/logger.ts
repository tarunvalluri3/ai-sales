import "server-only";
import * as Sentry from "@sentry/nextjs";

export type LogMetadata = Record<string, string | number | boolean | null>;

/**
 * Structured event logging for discrete business events (escalations,
 * rate-limit rejections, tool invocations) -- distinct from
 * lib/errors.ts's logAndGetUserMessage(), which stays the general
 * error-logging convention (docs/architecture.md's "Structured event
 * logging" section). `metadata`'s type deliberately excludes free text:
 * never pass prospect message content, contact info, or a tool's raw
 * input argument here -- identifiers, counts, and short enum strings
 * only.
 *
 * An "error"-level event is also forwarded to Sentry as a message
 * (Phase 21, STATE.md / docs/phases.md's "alerting on chat failures,
 * rate-limit spikes, failed embeddings, and handoff backlog") -- this
 * single choke point is what makes every existing "error"-level call
 * site (rate-limit rejections, failed tool invocations) alert-capable
 * without editing each one. Sentry groups repeated identical messages
 * into one issue, so a value that stays elevated across many polls
 * does not produce a new alert per tick.
 *
 * Never throws -- a logging call must never break the caller's own
 * control flow.
 */
export function logEvent(
  event: string,
  businessId: string,
  metadata?: LogMetadata,
  level: "info" | "error" = "info",
): void {
  const log = level === "error" ? console.error : console.log;
  try {
    log(JSON.stringify({ event, businessId, timestamp: new Date().toISOString(), ...metadata }));
  } catch {
    log(event, businessId);
  }

  if (level === "error") {
    Sentry.captureMessage(event, { level: "error", extra: { businessId, ...metadata } });
  }
}
