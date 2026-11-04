/**
 * Classifies any error that comes out of a Gemini call (directly, through
 * LangChain, or wrapped in an AppError) into a small set of kinds, so a
 * failed reply is logged and alerted on with a reason instead of as one
 * opaque exception (LAUNCH_AUDIT.md §12: "timeouts and errors behave
 * differently" -- only timeouts were handled; every other Gemini error was
 * rethrown and the WhatsApp/Instagram reply silently never happened).
 *
 * Pure and dependency-free (no server-only import) so the unit tests can
 * import it directly. It never reads or returns message text beyond matching
 * provider error codes; the result is a short enum safe for logs and tags.
 */

export type GeminiErrorKind =
  /** Our own AbortSignal deadline fired, or the call was aborted. */
  | "timeout"
  /** 429 / RESOURCE_EXHAUSTED: per-minute rate limit or quota. */
  | "rate_limited"
  /** 5xx / UNAVAILABLE / overloaded: Google-side outage. */
  | "unavailable"
  /** 401/403 / bad or revoked API key / billing disabled. */
  | "auth"
  /** 400 / INVALID_ARGUMENT: a request we built is wrong (a code bug). */
  | "invalid_request"
  /** The response was blocked by a safety filter or had no candidate. */
  | "blocked"
  /** DNS / connection reset / fetch failed before any HTTP status. */
  | "network"
  | "unknown";

const MAX_CAUSE_DEPTH = 5;

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  cause?: unknown;
  response?: { status?: unknown };
};

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === "object" && value !== null ? (value as ErrorLike) : null;
}

/** The error and its `.cause` chain (AppError wraps the provider error in `cause`). */
function errorChain(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
    const like = asErrorLike(current);
    if (!like) break;
    chain.push(like);
    current = like.cause;
  }
  return chain;
}

function statusOf(like: ErrorLike): number | null {
  for (const candidate of [like.status, like.response?.status, like.code]) {
    const value = typeof candidate === "string" ? Number.parseInt(candidate, 10) : candidate;
    if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) return value;
  }
  return null;
}

function textOf(like: ErrorLike): string {
  const parts = [like.name, like.message, typeof like.code === "string" ? like.code : null];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

export function classifyGeminiError(error: unknown): GeminiErrorKind {
  const chain = errorChain(error);
  if (chain.length === 0) return "unknown";

  for (const like of chain) {
    if (like.name === "TimeoutError" || like.name === "AbortError") return "timeout";
  }

  for (const like of chain) {
    const status = statusOf(like);
    if (status === 429) return "rate_limited";
    if (status === 401 || status === 403) return "auth";
    if (status !== null && status >= 500) return "unavailable";
    if (status === 400) {
      // A safety block can surface as a 400 on some paths; prefer the specific kind.
      return /SAFETY|blocked/i.test(textOf(like)) ? "blocked" : "invalid_request";
    }
  }

  const text = chain.map(textOf).join(" ");
  if (/RESOURCE_EXHAUSTED|rate.?limit|quota|InsufficientQuota|RateLimit/i.test(text)) return "rate_limited";
  if (/UNAVAILABLE|overloaded|INTERNAL|DEADLINE_EXCEEDED|Service Unavailable|Bad Gateway/i.test(text)) return "unavailable";
  if (/PERMISSION_DENIED|UNAUTHENTICATED|API key|API_KEY_INVALID/i.test(text)) return "auth";
  if (/SAFETY|blocked|finishReason|no candidates/i.test(text)) return "blocked";
  if (/INVALID_ARGUMENT/i.test(text)) return "invalid_request";
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network/i.test(text)) return "network";
  if (/timed? ?out/i.test(text)) return "timeout";
  return "unknown";
}

/**
 * Whether trying the same call again soon could plausibly succeed. Used only
 * for reporting; LangChain's own retry (CHAT_MODEL_MAX_RETRIES) is what
 * actually retries.
 */
export function isTransientGeminiError(kind: GeminiErrorKind): boolean {
  return kind === "timeout" || kind === "rate_limited" || kind === "unavailable" || kind === "network";
}
