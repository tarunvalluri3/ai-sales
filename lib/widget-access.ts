import { isAgentPublished } from "@/lib/agent-published";

/**
 * Why a public widget request was refused. Internal only: logged server-side
 * (lib/widget-auth.ts's logWidgetRejection) and sent to Sentry, never returned
 * to the browser -- the response body stays the generic "Invalid request."
 * (docs/security.md §10).
 */
export type WidgetRejectionReason =
  | "key_not_found"
  | "key_revoked"
  | "origin_missing"
  | "origin_not_allowed"
  | "agent_not_published"
  | "business_suspended"
  | "business_deleted"
  | "live_version_unavailable"
  | "lookup_failed";

export type WidgetKeyAccessRow = {
  status: string;
  allowed_origins: string[];
};

export type WidgetBusinessAccessRow = {
  live_version_id: string | null;
  status: "active" | "suspended";
  deleted_at: string | null;
};

/**
 * The widget key + origin + business-lifecycle decision, in the order a
 * human debugging it would want: is the key real, is the site allowed, is the
 * agent live. Returns null when every check passes. The live snapshot itself
 * is loaded afterwards by the caller (`live_version_unavailable` if that
 * fails); a lookup error is `lookup_failed`, decided by the caller too.
 */
export function evaluateWidgetAccess(
  key: WidgetKeyAccessRow | null,
  business: WidgetBusinessAccessRow | null,
  origin: string | null,
): WidgetRejectionReason | null {
  if (!key || !business) return "key_not_found";
  if (key.status !== "active") return "key_revoked";
  if (!origin) return "origin_missing";
  if (!key.allowed_origins.includes(origin)) return "origin_not_allowed";
  if (business.deleted_at) return "business_deleted";
  if (business.status === "suspended") return "business_suspended";
  if (!isAgentPublished(business)) return "agent_not_published";
  return null;
}

/**
 * HTTP status for a refusal. 401 only for a missing or invalid key; 403 when
 * the key is valid but this request may not use it (origin, unpublished,
 * suspended/deleted business); 503 for a server-side failure, which the widget
 * shows as a retryable error instead of "this chat isn't available".
 */
export function widgetRejectionStatus(reason: WidgetRejectionReason): 401 | 403 | 503 {
  switch (reason) {
    case "key_not_found":
    case "key_revoked":
      return 401;
    case "origin_missing":
    case "origin_not_allowed":
    case "agent_not_published":
    case "business_suspended":
    case "business_deleted":
      return 403;
    case "live_version_unavailable":
    case "lookup_failed":
      return 503;
  }
}
