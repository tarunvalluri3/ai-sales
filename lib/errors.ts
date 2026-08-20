import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Shared error convention: a safe, user-facing message is always separate
 * from the internal detail. Never surface `internalMessage`, `cause`, or a
 * raw stack trace to a client.
 */
export class AppError extends Error {
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(userMessage: string, internalMessage?: string, cause?: unknown) {
    super(internalMessage ?? userMessage);
    this.name = "AppError";
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

/**
 * Logs the full internal detail server-side, reports it to Sentry (Phase
 * 21, STATE.md / docs/phases.md), and returns only the safe user-facing
 * message. This is the single funnel point for every one of this
 * project's ~14 existing logAndGetUserMessage call sites, so wiring
 * error tracking in here covers all of them without touching each one.
 * Sentry's own beforeSend (lib/sentry-scrub.ts) already strips
 * cookies/auth headers; `cause` is passed as extra context rather than
 * interpolated into the captured message, since it may itself carry a
 * raw driver/provider error object.
 */
export function logAndGetUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    console.error(error.message, error.cause ?? "");
    Sentry.captureException(error, { extra: { cause: error.cause } });
    return error.userMessage;
  }

  console.error(error);
  Sentry.captureException(error);
  return "Something went wrong. Please try again.";
}
