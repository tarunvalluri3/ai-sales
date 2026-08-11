import "server-only";

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
 * Logs the full internal detail server-side and returns only the safe
 * user-facing message, ready to send back in a response.
 */
export function logAndGetUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    console.error(error.message, error.cause ?? "");
    return error.userMessage;
  }

  console.error(error);
  return "Something went wrong. Please try again.";
}
