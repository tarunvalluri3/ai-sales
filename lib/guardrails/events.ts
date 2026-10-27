import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { FLAG_SIGNALS } from "@/lib/guardrails/response-policy";
import { GUARDRAIL_MODES } from "@/lib/guardrails/config";
import { logEvent } from "@/lib/logger";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Abusive messages already recorded in this conversation (guardrails Phase 5).
 * Skipped entirely -- no query -- while the abuse check is log-only, so the
 * common path pays nothing. Fails to 0 on an error: a missed strike delays a
 * handover by one message, which is better than blocking real prospects.
 */
export async function countAbuseStrikes(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<number> {
  if (GUARDRAIL_MODES.abuse !== "enforce") return 0;
  const { count, error } = await supabase
    .from("guardrail_events")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("signal", "abuse");
  if (error || count === null) {
    logEvent("guardrail_strike_count_failed", businessId, { code: error?.code ?? "unknown" }, "error");
    return 0;
  }
  return count;
}

/** The recorded flag-worthy signal names for one conversation, for the owner's marker. Tenant-scoped; read under the owner's RLS session. */
export async function listConversationGuardrailFlags(
  supabase: SupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("guardrail_events")
    .select("signal")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .in("signal", [...FLAG_SIGNALS])
    .limit(200);
  if (error) return [];
  return (data ?? []).map((row: { signal: string }) => row.signal);
}

/**
 * Triggers per signal type for a business since `sinceIso` -- the per-business,
 * per-type count the brief asks to be possible. No page uses it yet (the owner
 * only gets the per-conversation marker); it is what a future report or the
 * pre-enforcement false-positive review reads.
 */
export async function countGuardrailEventsByType(
  supabase: SupabaseClient,
  businessId: string,
  sinceIso: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("guardrail_events")
    .select("signal")
    .eq("business_id", businessId)
    .gte("created_at", sinceIso)
    .limit(5000);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.signal] = (counts[row.signal] ?? 0) + 1;
  return counts;
}
