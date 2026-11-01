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
 * agent live everywhere. The same goes for any suspend path meant to stop
 * serving: today's platform-admin suspend/soft-delete only sets
 * `status`/`deleted_at`, which the website widget checks
 * (lib/widget-access.ts) but the WhatsApp/Instagram path
 * (lib/business-ai-context.ts) does NOT -- so either clear
 * `live_version_id` there too or add the status check to that path.
 *
 * Pure (no server-only import) so the unit tests can import it.
 */
export function isAgentPublished(business: { live_version_id: string | null }): boolean {
  return business.live_version_id != null;
}
