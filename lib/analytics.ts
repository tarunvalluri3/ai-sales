import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

/**
 * Same null-safe sandbox exclusion as lib/conversations.ts's own
 * EXCLUDE_SANDBOX_FILTER. Used two ways below: directly on a
 * `conversations` query, or via `{ referencedTable: "conversations" }` on
 * a `messages`/`leads` query that embeds `conversations!inner(source)` --
 * the `!inner` join in `.select()` is required for the latter, otherwise
 * the referenced-table filter is silently a no-op.
 */
const EXCLUDE_SANDBOX_FILTER = `source.is.null,source.neq.${SANDBOX_CONVERSATION_SOURCE}`;

/**
 * Conversation volume for a business: all-time, last 7 days, last 30
 * days. `businessId` must come from `requireBusinessContext()`.
 */
export async function getConversationVolumeStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ total: number; last7Days: number; last30Days: number }> {
  const [total, last7Days, last30Days] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", cutoffIso(7))
      .or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", cutoffIso(30))
      .or(EXCLUDE_SANDBOX_FILTER),
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
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "user")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("messages")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "assistant")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("messages")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "human_agent")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
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
  const base = () =>
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" });

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

/**
 * Phase 25b funnel metrics: qualified-lead rate (hot+warm leads /
 * conversations -- the next funnel stage past the existing "lead rate"
 * on the Analytics page, conversations -> leads -> qualified leads) and
 * answer-failure rate (ungrounded assistant replies / all assistant
 * replies, all-time). `businessId` must come from `requireBusinessContext()`.
 */
export async function getFunnelRateStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ qualifiedLeadRate: number; answerFailureRate: number }> {
  const [conversationTotal, qualifiedLeads, assistantTotal, assistantUngrounded] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .in("qualification", ["hot", "warm"])
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("messages")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "assistant")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("messages")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("role", "assistant")
      .eq("grounded", false)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
  ]);

  for (const result of [conversationTotal, qualifiedLeads, assistantTotal, assistantUngrounded]) {
    if (result.error) {
      throw new AppError(
        "Something went wrong loading your analytics. Please try again.",
        "getFunnelRateStats failed",
        result.error,
      );
    }
  }

  const conversations = conversationTotal.count ?? 0;
  const assistantReplies = assistantTotal.count ?? 0;

  return {
    qualifiedLeadRate: conversations === 0 ? 0 : Math.round(((qualifiedLeads.count ?? 0) / conversations) * 100),
    answerFailureRate:
      assistantReplies === 0 ? 0 : Math.round(((assistantUngrounded.count ?? 0) / assistantReplies) * 100),
  };
}

const HANDOFF_SAMPLE_LIMIT = 200;

/**
 * Average time from a conversation being flagged for attention
 * (`attention_flagged_at`, set the moment the AI escalates -- Phase 24)
 * to a human's first reply (`messages.role = 'human_agent'`), over the
 * most recent `HANDOFF_SAMPLE_LIMIT` flagged conversations. Computed in
 * JS over a bounded fetch rather than a database-side aggregate, same
 * "adequate at current data volume, revisit if that stops being true"
 * convention as `getAiResponseMetricsStats` -- avoids a raw-SQL RPC for
 * a join this project's real row counts don't yet justify.
 * `businessId` must come from `requireBusinessContext()`.
 */
export async function getHandoffResponseTimeStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ avgMinutes: number; sampleSize: number }> {
  const { data: flagged, error: flaggedError } = await supabase
    .from("conversations")
    .select("id, attention_flagged_at")
    .eq("business_id", businessId)
    .not("attention_flagged_at", "is", null)
    .or(EXCLUDE_SANDBOX_FILTER)
    .order("attention_flagged_at", { ascending: false })
    .limit(HANDOFF_SAMPLE_LIMIT);

  if (flaggedError) {
    throw new AppError(
      "Something went wrong loading your analytics. Please try again.",
      "getHandoffResponseTimeStats failed",
      flaggedError,
    );
  }

  if (!flagged || flagged.length === 0) {
    return { avgMinutes: 0, sampleSize: 0 };
  }

  const conversationIds = flagged.map((row) => row.id);
  const { data: replies, error: repliesError } = await supabase
    .from("messages")
    .select("conversation_id, created_at")
    .eq("business_id", businessId)
    .eq("role", "human_agent")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });

  if (repliesError) {
    throw new AppError(
      "Something went wrong loading your analytics. Please try again.",
      "getHandoffResponseTimeStats failed",
      repliesError,
    );
  }

  const firstReplyByConversation = new Map<string, string>();
  for (const reply of replies ?? []) {
    if (!firstReplyByConversation.has(reply.conversation_id)) {
      firstReplyByConversation.set(reply.conversation_id, reply.created_at);
    }
  }

  const responseTimesMs: number[] = [];
  for (const conversation of flagged) {
    const firstReplyAt = firstReplyByConversation.get(conversation.id);
    if (!firstReplyAt || !conversation.attention_flagged_at) continue;
    const deltaMs = new Date(firstReplyAt).getTime() - new Date(conversation.attention_flagged_at).getTime();
    if (deltaMs >= 0) responseTimesMs.push(deltaMs);
  }

  if (responseTimesMs.length === 0) {
    return { avgMinutes: 0, sampleSize: 0 };
  }

  const avgMs = responseTimesMs.reduce((sum, ms) => sum + ms, 0) / responseTimesMs.length;
  return { avgMinutes: Math.round(avgMs / 60000), sampleSize: responseTimesMs.length };
}

const TOP_ITEMS_ROW_LIMIT = 500;
const TOP_ITEMS_RESULT_LIMIT = 10;

/**
 * The most frequently asked questions the AI could not answer from
 * knowledge (Phase 25b, `public.unanswered_questions` -- logged by
 * app/api/chat/route.ts only for a genuine, non-escalated knowledge
 * gap). Grouped by exact (case/whitespace-normalized) question text
 * over the most recent `TOP_ITEMS_ROW_LIMIT` rows -- an approximate,
 * not semantic, grouping: two differently-phrased questions about the
 * same gap show as separate rows. `businessId` must come from
 * `requireBusinessContext()`.
 */
export async function getTopUnansweredQuestions(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ question: string; count: number }[]> {
  const { data, error } = await supabase
    .from("unanswered_questions")
    .select("question")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(TOP_ITEMS_ROW_LIMIT);

  if (error) {
    throw new AppError(
      "Something went wrong loading your analytics. Please try again.",
      "getTopUnansweredQuestions failed",
      error,
    );
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const normalized = row.question.trim().toLowerCase().replace(/\s+/g, " ");
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ITEMS_RESULT_LIMIT)
    .map(([question, count]) => ({ question, count }));
}

// --- Phase 31: Revenue & Conversion Intelligence ---
// Extends this file's existing analytics rather than replacing it. Every
// stat below is calculated from data this app already reliably stores;
// nothing here invents a "converted"/drop-off signal the schema doesn't
// actually have.

/** A funnel/period query with no explicit range covers "all time" -- a real date range wide enough that `.gte()`/`.lt()` can always be called unconditionally, avoiding a conditionally-typed query builder. */
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const FAR_FUTURE_ISO = "9999-01-01T00:00:00.000Z";

function normalizeRange(range?: { fromIso: string; toIso: string }): { fromIso: string; toIso: string } {
  return { fromIso: range?.fromIso ?? EPOCH_ISO, toIso: range?.toIso ?? FAR_FUTURE_ISO };
}

export type FunnelStage = { key: string; label: string; count: number };

/**
 * The sales funnel: conversations -> leads -> qualified (hot+warm) ->
 * appointments -> completed -> converted. "Converted" is `leads.status =
 * 'converted'` exactly as it already exists (a human-toggled field, D6) --
 * this app has no automated signal for "became a paying customer," and
 * this function does not invent one. Each stage is filtered by its own
 * row's `created_at` within `range` (a "created in this period" framing,
 * not a cohort-tracked funnel) -- `businessId` must come from
 * `requireBusinessContext()`.
 */
export async function getFunnelStats(
  supabase: SupabaseClient,
  businessId: string,
  range?: { fromIso: string; toIso: string },
): Promise<FunnelStage[]> {
  const { fromIso, toIso } = normalizeRange(range);

  const [conversations, leads, qualified, appointments, completed, converted] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .in("qualification", ["hot", "warm"])
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("appointments")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("appointments")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .eq("status", "completed")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .eq("status", "converted")
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
  ]);

  for (const result of [conversations, leads, qualified, appointments, completed, converted]) {
    if (result.error) {
      throw new AppError("Something went wrong loading your analytics. Please try again.", "getFunnelStats failed", result.error);
    }
  }

  return [
    { key: "conversations", label: "Conversations", count: conversations.count ?? 0 },
    { key: "leads", label: "Leads", count: leads.count ?? 0 },
    { key: "qualified", label: "Qualified", count: qualified.count ?? 0 },
    { key: "appointments", label: "Appointments", count: appointments.count ?? 0 },
    { key: "completed", label: "Completed", count: completed.count ?? 0 },
    { key: "converted", label: "Converted", count: converted.count ?? 0 },
  ];
}

export type DropOff = { fromLabel: string; toLabel: string; rate: number };

/** Pure function, no I/O: the drop-off percentage between each pair of adjacent funnel stages, in order. `0` (not calculated from nothing) when the earlier stage itself has zero rows. */
export function computeDropOffs(stages: FunnelStage[]): DropOff[] {
  const dropOffs: DropOff[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i];
    const to = stages[i + 1];
    const rate = from.count === 0 ? 0 : Math.round(((from.count - to.count) / from.count) * 100);
    dropOffs.push({ fromLabel: from.label, toLabel: to.label, rate });
  }
  return dropOffs;
}

const REAL_CHANNELS = ["chat_widget", "whatsapp", "instagram"] as const;

export type ChannelPerformance = {
  channel: string;
  conversations: number;
  leads: number;
  qualifiedLeads: number;
  appointments: number;
  completedAppointments: number;
  conversionRate: number;
  attentionRate: number;
};

/**
 * Per-channel performance (website/WhatsApp/Instagram). Sandbox
 * conversations are naturally excluded -- their `source` is
 * `dashboard_test`, not one of `REAL_CHANNELS`. A channel this business
 * has never used (zero conversations) is omitted rather than shown as an
 * all-zero row. `businessId` must come from `requireBusinessContext()`.
 */
export async function getChannelPerformanceStats(supabase: SupabaseClient, businessId: string): Promise<ChannelPerformance[]> {
  const results = await Promise.all(
    REAL_CHANNELS.map(async (channel): Promise<ChannelPerformance> => {
      const [conversations, needsAttention, leads, qualifiedLeads, appointments, completedAppointments] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("source", channel),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("source", channel)
          .eq("needs_attention", true),
        supabase
          .from("leads")
          .select("id, conversations!inner(source)", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("conversations.source", channel),
        supabase
          .from("leads")
          .select("id, conversations!inner(source)", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("conversations.source", channel)
          .in("qualification", ["hot", "warm"]),
        supabase
          .from("appointments")
          .select("id, conversations!inner(source)", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("conversations.source", channel),
        supabase
          .from("appointments")
          .select("id, conversations!inner(source)", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("conversations.source", channel)
          .eq("status", "completed"),
      ]);

      for (const result of [conversations, needsAttention, leads, qualifiedLeads, appointments, completedAppointments]) {
        if (result.error) {
          throw new AppError("Something went wrong loading your analytics. Please try again.", "getChannelPerformanceStats failed", result.error);
        }
      }

      const conversationCount = conversations.count ?? 0;
      return {
        channel,
        conversations: conversationCount,
        leads: leads.count ?? 0,
        qualifiedLeads: qualifiedLeads.count ?? 0,
        appointments: appointments.count ?? 0,
        completedAppointments: completedAppointments.count ?? 0,
        conversionRate: conversationCount === 0 ? 0 : Math.round(((leads.count ?? 0) / conversationCount) * 100),
        attentionRate: conversationCount === 0 ? 0 : Math.round(((needsAttention.count ?? 0) / conversationCount) * 100),
      };
    }),
  );

  return results.filter((result) => result.conversations > 0);
}

export type SourcePagePerformance = { sourceUrl: string; conversations: number; leads: number; leadRate: number };

/**
 * Per-page lead-conversion rate ("Pricing page, 8.4% lead conversion"),
 * not just raw conversation volume -- answers "which pages/channels
 * produce the best prospects," not just "which are busiest." Only
 * calculated from conversations with a real `source_url` (Phase 25b) --
 * conversations predating that column, or from WhatsApp/Instagram
 * (neither of which ever set `source_url`), are excluded rather than
 * counted as an "unknown" bucket. `businessId` must come from
 * `requireBusinessContext()`.
 */
export async function getSourcePagePerformance(supabase: SupabaseClient, businessId: string): Promise<SourcePagePerformance[]> {
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, source_url")
    .eq("business_id", businessId)
    .not("source_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(TOP_ITEMS_ROW_LIMIT);

  if (error) {
    throw new AppError("Something went wrong loading your analytics. Please try again.", "getSourcePagePerformance failed", error);
  }

  const rows = conversations ?? [];
  const urlByConversationId = new Map<string, string>();
  const conversationCountByUrl = new Map<string, number>();
  for (const row of rows) {
    if (!row.source_url) continue;
    urlByConversationId.set(row.id, row.source_url);
    conversationCountByUrl.set(row.source_url, (conversationCountByUrl.get(row.source_url) ?? 0) + 1);
  }

  const leadCountByUrl = new Map<string, number>();
  const conversationIds = rows.map((row) => row.id);
  if (conversationIds.length > 0) {
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("conversation_id")
      .eq("business_id", businessId)
      .in("conversation_id", conversationIds);

    if (leadsError) {
      throw new AppError("Something went wrong loading your analytics. Please try again.", "getSourcePagePerformance leads lookup failed", leadsError);
    }

    for (const lead of leads ?? []) {
      const url = urlByConversationId.get(lead.conversation_id);
      if (url) leadCountByUrl.set(url, (leadCountByUrl.get(url) ?? 0) + 1);
    }
  }

  return [...conversationCountByUrl.entries()]
    .map(([sourceUrl, conversationCount]) => {
      const leadCount = leadCountByUrl.get(sourceUrl) ?? 0;
      return {
        sourceUrl,
        conversations: conversationCount,
        leads: leadCount,
        leadRate: conversationCount === 0 ? 0 : Math.round((leadCount / conversationCount) * 1000) / 10,
      };
    })
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, TOP_ITEMS_RESULT_LIMIT);
}

export type PeriodComparison = { current: number; previous: number; percentChange: number | null };

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null; // never compare against a zero baseline -- "infinite % change" is not a real number
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Period-over-period comparison for conversations and leads over the
 * last `days` days vs. the equivalent immediately-preceding period (Phase
 * 25b's funnel-analytics scope, extended here) -- e.g. "last 30 days" vs.
 * "the 30 days before that." Never compares mismatched period lengths.
 * `businessId` must come from `requireBusinessContext()`.
 */
export async function getPeriodComparisonStats(
  supabase: SupabaseClient,
  businessId: string,
  days: number,
): Promise<{ conversations: PeriodComparison; leads: PeriodComparison }> {
  const now = Date.now();
  const currentFromIso = new Date(now - days * DAY_MS).toISOString();
  const previousFromIso = new Date(now - days * 2 * DAY_MS).toISOString();
  const previousToIso = currentFromIso;

  const [currentConversations, previousConversations, currentLeads, previousLeads] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", currentFromIso).or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", previousFromIso)
      .lt("created_at", previousToIso)
      .or(EXCLUDE_SANDBOX_FILTER),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", currentFromIso)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
    supabase
      .from("leads")
      .select("id, conversations!inner(source)", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", previousFromIso)
      .lt("created_at", previousToIso)
      .or(EXCLUDE_SANDBOX_FILTER, { referencedTable: "conversations" }),
  ]);

  for (const result of [currentConversations, previousConversations, currentLeads, previousLeads]) {
    if (result.error) {
      throw new AppError("Something went wrong loading your analytics. Please try again.", "getPeriodComparisonStats failed", result.error);
    }
  }

  return {
    conversations: {
      current: currentConversations.count ?? 0,
      previous: previousConversations.count ?? 0,
      percentChange: percentChange(currentConversations.count ?? 0, previousConversations.count ?? 0),
    },
    leads: {
      current: currentLeads.count ?? 0,
      previous: previousLeads.count ?? 0,
      percentChange: percentChange(currentLeads.count ?? 0, previousLeads.count ?? 0),
    },
  };
}

const AI_METRICS_ROW_LIMIT = 500;

/**
 * AI response latency/cost stats for a business over the last 7 days
 * (Phase 21). Averages/sums are computed here over a bounded row fetch
 * (most-recent `AI_METRICS_ROW_LIMIT` rows within the window), not a
 * database-side aggregate -- adequate at this project's current data
 * volume (Phase 19b's own HNSW-index check found single-digit row
 * counts project-wide); revisit with a real Postgres aggregate/RPC
 * (matching match_knowledge_chunks's pattern) if that stops being true.
 * `businessId` must come from `requireBusinessContext()`.
 */
export async function getAiResponseMetricsStats(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{
  responseCount: number;
  avgLatencyMs: number;
  totalTokens: number;
  avgTokensPerResponse: number;
}> {
  const { data, error } = await supabase
    .from("ai_response_metrics")
    .select("latency_ms, input_tokens, output_tokens")
    .eq("business_id", businessId)
    .gte("created_at", cutoffIso(7))
    .order("created_at", { ascending: false })
    .limit(AI_METRICS_ROW_LIMIT);

  if (error) {
    throw new AppError(
      "Something went wrong loading your analytics. Please try again.",
      "getAiResponseMetricsStats failed",
      error,
    );
  }

  const rows = data ?? [];
  const responseCount = rows.length;
  const totalLatencyMs = rows.reduce((sum, row) => sum + row.latency_ms, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0);

  return {
    responseCount,
    avgLatencyMs: responseCount > 0 ? Math.round(totalLatencyMs / responseCount) : 0,
    totalTokens,
    avgTokensPerResponse: responseCount > 0 ? Math.round(totalTokens / responseCount) : 0,
  };
}
