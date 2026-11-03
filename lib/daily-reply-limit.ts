import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatProtectionConfigFromEnv, DAY_SECONDS } from "@/lib/chat-protection";
import { checkRateLimitsBatch, incrementRateLimitCounter, type BatchedRateLimitCheck } from "@/lib/rate-limit";
import { flagConversationNeedsAttention } from "@/lib/conversations";
import { sendOpsAlert } from "@/lib/ops-alert";
import { logEvent } from "@/lib/logger";
import {
  runDailyReplyLimit,
  type DailyLimitChannel,
  type DailyReplyCaps,
  type DailyReplyCounts,
  type DailyReplyLimitResult,
} from "@/lib/daily-reply-limit-rules";

export type { DailyReplyLimitResult };

export function dailyReplyCapsFromEnv(env: Record<string, string | undefined> = process.env): DailyReplyCaps {
  const config = chatProtectionConfigFromEnv(env);
  return { perBusiness: config.geminiDailyTurnsPerBusiness, global: config.geminiDailyTurnsGlobal };
}

/**
 * Counts ONE AI reply against the shared daily caps and says whether it may
 * call Gemini (production readiness round 3, item 1). Call it exactly once per
 * prospect message, immediately before askSalesEmployee(), after every other
 * gate (human control, serving, guardrail canned replies) -- so only turns that
 * would really produce an AI reply are counted. On WhatsApp and Instagram it
 * runs after the inbound de-duplication insert, so a webhook Meta redelivers
 * never reaches it twice.
 *
 * Over a cap, or when the counters can't be read: the conversation is flagged
 * for the team, the owner is alerted (once per cap per UTC day; a counter
 * outage is throttled by sendOpsAlert), and the caller must NOT call Gemini.
 * The caller sends SOFT_LIMIT_MESSAGE only when `notice === "send"`.
 * Never throws. Rules and tests: lib/daily-reply-limit-rules.ts.
 */
export async function checkDailyReplyLimit(params: {
  supabase: SupabaseClient;
  channel: DailyLimitChannel;
  businessId: string;
  conversationId: string;
  clerkOrgId: string;
  /** When the prospect sent the message (epoch ms), for the 24-hour window; null = just now. */
  inboundAtMs: number | null;
}): Promise<DailyReplyLimitResult> {
  const caps = dailyReplyCapsFromEnv();
  return runDailyReplyLimit(
    {
      incrementDailyCounters,
      incrementNoticeCounter: (conversationId) =>
        incrementRateLimitCounter("gemini_cap_notice", conversationId, DAY_SECONDS),
      flagConversation: async () => {
        await flagConversationNeedsAttention(params.supabase, params.businessId, params.conversationId, params.clerkOrgId);
      },
      alertCapReached: (which) =>
        void sendOpsAlert({
          event: "gemini_daily_cap_reached",
          businessId: params.businessId,
          subject:
            which === "global" ? "Daily AI reply limit reached for ALL businesses" : "Daily AI reply limit reached for one business",
          paragraphs: [
            "No more AI replies will be generated under this limit until 00:00 UTC, on the website, WhatsApp or Instagram. Each affected conversation is flagged for the team.",
            "Raise GEMINI_DAILY_TURN_CAP_PER_BUSINESS / GEMINI_DAILY_TURN_CAP_GLOBAL if this is real traffic. You get this email once per limit per day.",
          ],
          facts: [
            { label: "Limit", value: which === "global" ? `overall (${caps.global}/day)` : `per business (${caps.perBusiness}/day)` },
            { label: "Business", value: params.businessId },
            { label: "Channel", value: params.channel },
          ],
        }),
      alertCounterUnavailable: () =>
        void sendOpsAlert({
          event: "gemini_daily_counter_unavailable",
          businessId: params.businessId,
          subject: "AI replies paused: the daily limit counter can't be read",
          paragraphs: [
            "The daily AI reply counter could not be read, so no AI reply was generated (it is treated as over the limit). Conversations are flagged for the team. Check the database and the rate_limit_counters table.",
          ],
          facts: [{ label: "Channel", value: params.channel }],
          throttleKey: "gemini_daily_counter_unavailable",
        }),
      log: (event, fields, level) => logEvent(event, params.businessId, fields, level),
      nowMs: () => Date.now(),
    },
    { channel: params.channel, businessId: params.businessId, conversationId: params.conversationId, inboundAtMs: params.inboundAtMs, caps },
  );
}

/** Both counters in one round trip. A cap of 0 is off, so its counter is neither bumped nor read. */
async function incrementDailyCounters(businessId: string, caps: DailyReplyCaps): Promise<DailyReplyCounts> {
  const checks: BatchedRateLimitCheck[] = [];
  if (caps.perBusiness > 0) {
    checks.push({ scope: "gemini_daily_business", identifier: businessId, limit: caps.perBusiness, windowSeconds: DAY_SECONDS });
  }
  if (caps.global > 0) {
    checks.push({ scope: "gemini_daily_global", identifier: "all", limit: caps.global, windowSeconds: DAY_SECONDS });
  }
  if (checks.length === 0) return { business: null, global: null };
  try {
    const results = await checkRateLimitsBatch(checks, businessId);
    return {
      business: results.get("gemini_daily_business")?.requestCount ?? null,
      global: results.get("gemini_daily_global")?.requestCount ?? null,
    };
  } catch {
    // checkRateLimitsBatch logs RPC errors itself; a thrown error is the same outage.
    return { business: null, global: null };
  }
}
