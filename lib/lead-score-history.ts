import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LeadQualification, LeadScoreHistoryEntry } from "@/lib/supabase/types";
import type { LeadScoreReasonItem } from "@/lib/lead-scoring";
import { AppError } from "@/lib/errors";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Persists one point-in-time score snapshot for a lead (Phase 28).
 * Client-injected, same convention as `upsertLeadForConversation` in
 * lib/leads.ts (its only caller) -- the widget/AI-tool path has no Clerk
 * session, so it always runs under the service-role client there.
 * Never throws: a failure to record history must never break lead
 * persistence, which has already succeeded by the time this is called.
 */
export async function recordLeadScoreChange(
  supabase: SupabaseClient,
  businessId: string,
  leadId: string,
  entry: { score: number; qualification: LeadQualification; reasons: LeadScoreReasonItem[] },
): Promise<void> {
  const { error } = await supabase.from("lead_score_history").insert({
    business_id: businessId,
    lead_id: leadId,
    score: entry.score,
    qualification: entry.qualification,
    reasons: entry.reasons,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "lead_score_history_write_failed",
        businessId,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

/** Lists a lead's score history, most recent first. `businessId` must come from `requireBusinessContext()`. */
export async function listLeadScoreHistory(
  businessId: string,
  leadId: string,
  limit = 20,
): Promise<LeadScoreHistoryEntry[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lead_score_history")
    .select("*")
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(
      "Something went wrong loading this lead's score history. Please try again.",
      "listLeadScoreHistory failed",
      error,
    );
  }

  return data as LeadScoreHistoryEntry[];
}
