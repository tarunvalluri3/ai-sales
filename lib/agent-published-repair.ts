import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { needsPublishedRestamp } from "@/lib/agent-published";
import { logEvent } from "@/lib/logger";

type RestampRow = {
  live_version_id: string | null;
  published_at: string | null;
  onboarding_completed_at: string | null;
  status: "active" | "suspended";
  deleted_at: string | null;
};

/**
 * The per-row form of migration 20261110000000's repair, run when /apache
 * reinstates a business (lib/admin-tenant-actions.ts reactivateTenant): if the
 * row is live but `published_at` was never stamped, write what a real publish
 * writes -- published_at, onboarding_step, onboarding_completed_at -- then
 * live_answer_bank_version from the row the answer-bank bump trigger just
 * updated (two statements, the same order as agent_publish_internal()). Only
 * stamps columns: no new version, no knowledge re-check.
 *
 * `supabase` must be a service/admin client. Best effort: logs and returns
 * false on failure rather than failing the reinstatement that already
 * succeeded. Returns true when it repaired the row.
 */
export async function restampPublishedIfMissing(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const { data: row, error: readError } = await supabase
    .from("businesses")
    .select("live_version_id, published_at, onboarding_completed_at, status, deleted_at")
    .eq("id", businessId)
    .maybeSingle<RestampRow>();
  if (readError || !row) {
    if (readError) logEvent("published_restamp_failed", businessId, { step: "read" }, "error");
    return false;
  }
  if (!needsPublishedRestamp(row)) return false;

  const now = new Date().toISOString();
  const { data: stamped, error: stampError } = await supabase
    .from("businesses")
    .update({ published_at: now, onboarding_step: "live", onboarding_completed_at: row.onboarding_completed_at ?? now })
    .eq("id", businessId)
    .is("published_at", null)
    .select("answer_bank_version")
    .maybeSingle<{ answer_bank_version: number | string }>();
  if (stampError) {
    logEvent("published_restamp_failed", businessId, { step: "stamp" }, "error");
    return false;
  }
  // Someone else stamped it in between (e.g. a publish) -- nothing left to do.
  if (!stamped) return false;

  const { error: versionError } = await supabase
    .from("businesses")
    .update({ live_answer_bank_version: stamped.answer_bank_version })
    .eq("id", businessId);
  if (versionError) {
    logEvent("published_restamp_failed", businessId, { step: "live_answer_bank_version" }, "error");
  }

  logEvent("published_restamped", businessId, { trigger: "reinstate" });
  return true;
}
