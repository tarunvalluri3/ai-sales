import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import {
  agentSnapshotSchema,
  countChanges,
  diffAgentSnapshots,
  type AgentChange,
} from "@/lib/agent-snapshot";

/**
 * Where the draft stands against the live version (Draft -> Publish -> Live).
 * Drives the dashboard header pill, the "Publish changes (N)" button and the
 * review dialog. Plain data, safe to pass to client components.
 */
export type AgentPublishStatus = {
  /** True once a version has been published -- the agent is serving prospects. */
  isLive: boolean;
  /** The version currently live; null before the first publish. */
  liveVersion: number | null;
  hasUnpublishedChanges: boolean;
  changes: AgentChange[];
  changeCount: number;
};

type StatusRow = {
  live_version: number | null;
  live_snapshot: unknown;
  draft_snapshot: unknown;
};

/**
 * One RPC round trip (`agent_publish_status`, SECURITY INVOKER so RLS scopes
 * every read): the database compares the draft's hash with the live version's
 * and only returns the two snapshots when they differ -- an up-to-date agent
 * costs one small response, and no diffing happens in that (common) case.
 * Memoized per request with React `cache()`, so the layout and any page can
 * both ask. `businessId` must come from `requireBusinessContext()`.
 */
export const getAgentPublishStatus = cache(async (businessId: string): Promise<AgentPublishStatus> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("agent_publish_status", { p_business_id: businessId });

  if (error) {
    throw new AppError(
      "Something went wrong checking your unpublished changes. Please try again.",
      "getAgentPublishStatus failed",
      error,
    );
  }

  const row = (data as StatusRow[] | null)?.[0];
  if (!row || row.live_version === null) {
    return { isLive: false, liveVersion: null, hasUnpublishedChanges: false, changes: [], changeCount: 0 };
  }

  // Snapshots absent => the draft hash equals the live hash: nothing to publish.
  if (row.live_snapshot == null || row.draft_snapshot == null) {
    return { isLive: true, liveVersion: row.live_version, hasUnpublishedChanges: false, changes: [], changeCount: 0 };
  }

  const live = agentSnapshotSchema.safeParse(row.live_snapshot);
  const draft = agentSnapshotSchema.safeParse(row.draft_snapshot);
  let changes: AgentChange[] = live.success && draft.success ? diffAgentSnapshots(live.data, draft.data) : [];
  // The hashes differ, so something changed even if the diff has no label for
  // it (or a snapshot failed to parse): never show "up to date" for that.
  if (changes.length === 0) {
    changes = [{ area: "business", label: "Other changes", count: 1 }];
  }

  return {
    isLive: true,
    liveVersion: row.live_version,
    hasUnpublishedChanges: true,
    changes,
    changeCount: countChanges(changes),
  };
});
