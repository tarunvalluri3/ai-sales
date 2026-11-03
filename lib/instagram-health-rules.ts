/**
 * Pure rules for the Instagram connection health check (production readiness,
 * item 7). No server-only import.
 *
 * Why a health check instead of "token refresh": with Instagram API with
 * Facebook Login we store a PAGE access token derived from a long-lived User
 * token. Meta's "Get long-lived tokens" docs: such Page tokens have no expiry
 * date, and there is no refresh endpoint for them. They can still die early
 * (password change, the person removing the app or a permission in Business
 * Integrations, losing Page admin). Unified Login system-user tokens likewise
 * don't expire. So the job that matters is noticing a dead token or a removed
 * Page subscription BEFORE a prospect's message goes unanswered.
 */
import { isRevokedTokenError, type GraphError } from "@/lib/meta-instagram-rules";

export type HealthProbe = { ok: true; data: unknown } | { ok: false; status: number; error: GraphError | null };

export type HealthVerdict =
  /** Token works (and, for Facebook Login, our app is subscribed to the Page). */
  | "healthy"
  /** Token works but our app is no longer subscribed to the Page: webhooks have stopped. Re-subscribe. */
  | "resubscribe"
  /** Token revoked/invalid: mark disconnected and ask the owner to reconnect. */
  | "revoked"
  /** Network/5xx/rate limit: try again next run, change nothing. */
  | "transient"
  /** Some other Graph error (e.g. a permission missing): log it, change nothing. */
  | "error";

/** `GET /<PAGE_ID>/subscribed_apps` -> is our app in the list? */
export function isAppSubscribed(body: unknown, appId: string | undefined): boolean {
  if (!appId || !body || typeof body !== "object") return false;
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return false;
  return data.some((entry) => entry && typeof entry === "object" && String((entry as { id?: unknown }).id) === appId);
}

export function judgeHealthProbe(probe: HealthProbe, options: { checkSubscription: boolean; appId: string | undefined }): HealthVerdict {
  if (!probe.ok) {
    if (isRevokedTokenError(probe.status, probe.error)) return "revoked";
    if (probe.status === 0 || probe.status >= 500 || probe.status === 429 || probe.error?.code === 4 || probe.error?.code === 17) return "transient";
    return "error";
  }
  if (options.checkSubscription && !isAppSubscribed(probe.data, options.appId)) return "resubscribe";
  return "healthy";
}
