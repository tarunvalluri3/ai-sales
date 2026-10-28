import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { agentSnapshotSchema, type AgentSnapshot } from "@/lib/agent-snapshot";
import { logEvent } from "@/lib/logger";

/**
 * Where a chat turn reads the agent's content from (Draft -> Publish -> Live,
 * 2026-10-29).
 *
 *  - `live`: the published, immutable `agent_versions` snapshot plus that
 *    version's `live_knowledge_chunks`. Used by every prospect-facing channel
 *    (website widget, WhatsApp, Instagram). Nothing on this path reads the
 *    editing tables.
 *  - `draft`: the editing tables, i.e. what the owner is working on. Used only
 *    by the dashboard's "Testing draft" chat. It is the default everywhere, so
 *    a caller that forgets to pass a source can only ever read the draft --
 *    never serve it to a prospect, because the three live callers pass `live`
 *    explicitly and the public routes cannot construct a draft source from
 *    request input.
 */
export type LiveAgentSource = {
  kind: "live";
  versionId: string;
  snapshot: AgentSnapshot;
};

export type AgentSource = { kind: "draft" } | LiveAgentSource;

export const DRAFT_SOURCE: AgentSource = { kind: "draft" };

/**
 * Snapshots are immutable per version id, so this cache never needs a TTL:
 * publishing creates a NEW version id, and the next request (which reads
 * `businesses.live_version_id` fresh) simply misses. Keyed by business AND
 * version so one tenant's entry can never satisfy another's lookup. Bounded;
 * oldest-inserted entry is dropped first. Per serverless instance.
 */
const SNAPSHOT_CACHE_MAX_ENTRIES = 200;
const snapshotCache = new Map<string, AgentSnapshot>();

function snapshotCacheKey(businessId: string, versionId: string): string {
  return `${businessId}:${versionId}`;
}

/**
 * The live source for a (businessId, versionId) pair the caller already
 * trusts (both come from a business row read via a validated widget key /
 * channel lookup). Returns null when the version row is missing or does not
 * parse -- callers treat that as "no live agent" and fail closed.
 */
export async function loadLiveAgentSourceByVersion(
  businessId: string,
  versionId: string,
): Promise<LiveAgentSource | null> {
  const key = snapshotCacheKey(businessId, versionId);
  const cached = snapshotCache.get(key);
  if (cached) return { kind: "live", versionId, snapshot: cached };

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("agent_versions")
    .select("snapshot")
    .eq("business_id", businessId)
    .eq("id", versionId)
    .maybeSingle();

  if (error || !data) {
    logEvent("agent_snapshot_load_failed", businessId, { versionId }, "error");
    return null;
  }

  const parsed = agentSnapshotSchema.safeParse(data.snapshot);
  if (!parsed.success) {
    logEvent("agent_snapshot_invalid", businessId, { versionId }, "error");
    return null;
  }

  if (snapshotCache.size >= SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest !== undefined) snapshotCache.delete(oldest);
  }
  snapshotCache.set(key, parsed.data);
  return { kind: "live", versionId, snapshot: parsed.data };
}
