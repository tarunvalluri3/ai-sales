import { isAgentPublished } from "@/lib/agent-published";

/**
 * THE suspended/deleted check for a business (Phase 33 Stop 2: a platform
 * admin's suspend or soft-delete must actually stop the AI replying, not just
 * mark a column). Every AI entry point goes through it:
 *   - website widget: lib/widget-access.ts evaluateWidgetAccess()
 *   - WhatsApp, Instagram and any future channel: lib/business-ai-context.ts
 *     loadBusinessAiContext() -- the only way to get the live snapshot
 *     askSalesEmployee() needs outside the widget
 *   - answer-bank generation: lib/answer-bank/generate.ts
 *   - the dashboard: lib/business-context.ts (redirect to /suspended)
 * scripts/run-business-lifecycle-tests.mjs fails if a caller of
 * askSalesEmployee()/streamSalesEmployee() bypasses those loaders.
 *
 * Pure (no server-only import) so the unit tests can import it.
 */
export type BusinessLifecycleBlock = "business_suspended" | "business_deleted";

export function businessLifecycleBlock(business: {
  status: "active" | "suspended";
  deleted_at: string | null;
}): BusinessLifecycleBlock | null {
  if (business.deleted_at) return "business_deleted";
  if (business.status === "suspended") return "business_suspended";
  return null;
}

export type ChannelAccessRejection = "business_not_found" | BusinessLifecycleBlock | "agent_not_published";

/**
 * May a non-widget channel (WhatsApp, Instagram, anything added later) get an
 * AI reply for this business? Same rules as the widget minus the key/origin
 * part: exists, not suspended or deleted, published. Null means yes.
 */
export function evaluateChannelAccess(
  business: { status: "active" | "suspended"; deleted_at: string | null; live_version_id: string | null } | null,
): ChannelAccessRejection | null {
  if (!business) return "business_not_found";
  const blocked = businessLifecycleBlock(business);
  if (blocked) return blocked;
  if (!isAgentPublished(business)) return "agent_not_published";
  return null;
}
