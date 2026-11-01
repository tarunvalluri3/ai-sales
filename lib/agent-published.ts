/**
 * THE published/live signal for an agent (agent == business). Every surface
 * that decides "is this agent live?" reads this, never a column directly: the
 * widget chat API (lib/widget-auth.ts), the dashboard gate
 * (lib/business-context.ts), the onboarding wizard's redirect and Draft/Live
 * badge, the widget-settings "Not published yet" card and install guide, the
 * onboarding step cache and the readiness report. The dashboard header's pill
 * reads the same column through the `agent_publish_status` RPC.
 *
 * `live_version_id` is the field the runtime actually serves from (the
 * published snapshot), so it is the one that can never disagree with what a
 * prospect gets. `published_at` is only "when it was last published" -- it
 * drives the answer-bank bump and analytics, and on 2026-11-01 it was found
 * to be null for every business first published after 20261107000000 (the
 * publish RPC passed its backfill flag), which made the API, dashboard and
 * wizard say "unpublished" while the header said "Live". There is no
 * unpublish path, so once set it stays set.
 *
 * IMPORTANT: any future unpublish (or "take offline") path MUST clear
 * `live_version_id` -- setting `published_at` to null alone would leave the
 * agent live everywhere. Suspend/soft-delete are a separate gate: they keep
 * `live_version_id` and are refused by lib/business-lifecycle.ts, which every
 * AI entry point (widget, WhatsApp, Instagram, answer-bank generation, the
 * dashboard) runs.
 *
 * Pure (no server-only import) so the unit tests can import it.
 */
export function isAgentPublished(business: { live_version_id: string | null }): boolean {
  return business.live_version_id != null;
}

/**
 * True for a row in the state the 2026-11-01 publish bug left behind: live
 * (`live_version_id` set) but never stamped (`published_at` null), and allowed
 * to serve. Migration 20261110000000 repaired every such active row but
 * deliberately skipped suspended/deleted ones; lib/agent-published-repair.ts
 * repairs those when /apache reinstates them. pgTAP 063 asserts no active,
 * non-deleted row is ever left in this state.
 */
export function needsPublishedRestamp(business: {
  live_version_id: string | null;
  published_at: string | null;
  status: "active" | "suspended";
  deleted_at: string | null;
}): boolean {
  return (
    isAgentPublished(business) &&
    business.published_at == null &&
    business.status === "active" &&
    business.deleted_at == null
  );
}
