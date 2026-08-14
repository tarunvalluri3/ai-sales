import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

/**
 * Conversation volume for a business: all-time, last 7 days, last 30
 * days. `businessId` must come from `requireBusinessContext()`.
 */
export async function getConversationVolumeStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ total: number; last7Days: number; last30Days: number }> {
  const [total, last7Days, last30Days] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", cutoffIso(7)),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", cutoffIso(30)),
  ]);

  for (const result of [total, last7Days, last30Days]) {
    if (result.error) {
      throw new AppError(
        "Something went wrong loading your analytics. Please try again.",
        "getConversationVolumeStats failed",
        result.error,
      );
    }
  }

  return {
    total: total.count ?? 0,
    last7Days: last7Days.count ?? 0,
    last30Days: last30Days.count ?? 0,
  };
}

/**
 * Message volume for a business, broken down by role. `businessId` must
 * come from `requireBusinessContext()`.
 */
export async function getMessageVolumeStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ user: number; assistant: number; humanAgent: number }> {
  const [user, assistant, humanAgent] = await Promise.all([
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "user"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "assistant"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "human_agent"),
  ]);

  for (const result of [user, assistant, humanAgent]) {
    if (result.error) {
      throw new AppError(
        "Something went wrong loading your analytics. Please try again.",
        "getMessageVolumeStats failed",
        result.error,
      );
    }
  }

  return {
    user: user.count ?? 0,
    assistant: assistant.count ?? 0,
    humanAgent: humanAgent.count ?? 0,
  };
}

/**
 * Lead stats for a business: total, breakdown by qualification, breakdown
 * by status, and how many have requested a callback (Phase 14c).
 * `businessId` must come from `requireBusinessContext()`.
 */
export async function getLeadStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{
  total: number;
  byQualification: { hot: number; warm: number; cold: number };
  byStatus: { new: number; contacted: number; converted: number; lost: number };
  requestedCallback: number;
}> {
  const base = () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("business_id", businessId);

  const [total, hot, warm, cold, statusNew, contacted, converted, lost, requestedCallback] = await Promise.all([
    base(),
    base().eq("qualification", "hot"),
    base().eq("qualification", "warm"),
    base().eq("qualification", "cold"),
    base().eq("status", "new"),
    base().eq("status", "contacted"),
    base().eq("status", "converted"),
    base().eq("status", "lost"),
    base().eq("requested_callback", true),
  ]);

  for (const result of [total, hot, warm, cold, statusNew, contacted, converted, lost, requestedCallback]) {
    if (result.error) {
      throw new AppError(
        "Something went wrong loading your analytics. Please try again.",
        "getLeadStats failed",
        result.error,
      );
    }
  }

  return {
    total: total.count ?? 0,
    byQualification: { hot: hot.count ?? 0, warm: warm.count ?? 0, cold: cold.count ?? 0 },
    byStatus: {
      new: statusNew.count ?? 0,
      contacted: contacted.count ?? 0,
      converted: converted.count ?? 0,
      lost: lost.count ?? 0,
    },
    requestedCallback: requestedCallback.count ?? 0,
  };
}
