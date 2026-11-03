/**
 * Daily AI reply limits, shared by every channel (production readiness round 3,
 * item 1, 2026-11-03). Pure: no server-only import and no I/O, so every branch
 * is unit-tested (scripts/run-daily-reply-limit-tests.mjs). The I/O wrapper is
 * lib/daily-reply-limit.ts.
 *
 * - ONE pair of counters for website, WhatsApp and Instagram: per business
 *   (`gemini_daily_business`, keyed on business_id) and overall
 *   (`gemini_daily_global`, keyed on "all"), per UTC day.
 * - A counter that can't be read is handled exactly like being over the limit
 *   (no Gemini call), and logged -- the opposite of the round-2 widget-only
 *   caps, which failed open.
 * - The owner is alerted once per cap per UTC day: only the request whose
 *   increment returned exactly cap + 1 alerts. The increment is atomic in
 *   Postgres, so exactly one request across every instance sees that value.
 */
import { MESSAGING_WINDOW_MS } from "@/lib/meta-instagram-rules";

export type DailyLimitChannel = "website" | "whatsapp" | "instagram";

export type DailyReplyCaps = {
  /** AI replies per business per UTC day across all channels. 0 = no cap. */
  perBusiness: number;
  /** AI replies per UTC day across ALL businesses and channels. 0 = no cap. */
  global: number;
};

/** `null` = that counter could not be read (or was not read because its cap is 0). */
export type DailyReplyCounts = { business: number | null; global: number | null };

export type DailyLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: "global" | "business" | "counter_unavailable" };

/**
 * Over a cap, or a counter that can't be read for an enabled cap, is a block.
 * A cap of 0 is off, so its counter is ignored. `counter_unavailable` wins
 * over a reached cap only when no cap is known to be reached.
 */
export function dailyLimitVerdict(counts: DailyReplyCounts, caps: DailyReplyCaps): DailyLimitVerdict {
  const globalOn = caps.global > 0;
  const businessOn = caps.perBusiness > 0;
  if (globalOn && counts.global !== null && counts.global > caps.global) return { allowed: false, reason: "global" };
  if (businessOn && counts.business !== null && counts.business > caps.perBusiness) {
    return { allowed: false, reason: "business" };
  }
  if ((globalOn && counts.global === null) || (businessOn && counts.business === null)) {
    return { allowed: false, reason: "counter_unavailable" };
  }
  return { allowed: true };
}

/**
 * The caps this very request pushed over the limit (its increment returned
 * exactly cap + 1). Those, and only those, alert the owner -- so a capped
 * business that keeps receiving messages alerts once per day, not per message
 * and not once per server instance.
 */
export function capsCrossedByThisRequest(counts: DailyReplyCounts, caps: DailyReplyCaps): ("global" | "business")[] {
  const crossed: ("global" | "business")[] = [];
  if (caps.global > 0 && counts.global === caps.global + 1) crossed.push("global");
  if (caps.perBusiness > 0 && counts.business === caps.perBusiness + 1) crossed.push("business");
  return crossed;
}

export type LimitNoticeDecision =
  | "send"
  /** WhatsApp/Instagram: the prospect already got the notice in this conversation today. */
  | "skip_already_sent"
  /** WhatsApp/Instagram: the 24-hour customer-service window is closed (late delivery). */
  | "skip_window_closed"
  /** WhatsApp/Instagram: the notice counter couldn't be read; skipped so it can never repeat. */
  | "skip_notice_unknown";

/**
 * Whether the prospect is told "a person will follow up".
 * - website: always. The visitor is waiting on this request's response, so
 *   the notice IS the reply to their message (nothing is pushed to them later).
 * - WhatsApp / Instagram: only inside the 24-hour window measured from the
 *   message being answered, and only for the first blocked message in the
 *   conversation per UTC day (`noticeCount` is that conversation's notice
 *   counter after this request's increment: 1 = first). A counter error skips
 *   the notice rather than risk sending it on every message; the conversation
 *   is still flagged.
 */
export function limitNoticeDecision(input: {
  channel: DailyLimitChannel;
  /** When the prospect sent the message being answered (epoch ms); null = unknown, treated as just now. */
  inboundAtMs: number | null;
  nowMs: number;
  /** Notice counter after increment; ignored for the website. */
  noticeCount: number | null;
}): LimitNoticeDecision {
  if (input.channel === "website") return "send";
  if (input.inboundAtMs !== null && input.nowMs - input.inboundAtMs > MESSAGING_WINDOW_MS) return "skip_window_closed";
  if (input.noticeCount === null) return "skip_notice_unknown";
  return input.noticeCount === 1 ? "send" : "skip_already_sent";
}

export type DailyReplyLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "global" | "business" | "counter_unavailable";
      /** Send the fixed "a person will follow up" notice only when this is "send". */
      notice: LimitNoticeDecision;
    };

export type DailyReplyLimitDeps = {
  /** Bumps the enabled daily counters (one round trip) and returns them; null = not readable. Must not throw. */
  incrementDailyCounters: (businessId: string, caps: DailyReplyCaps) => Promise<DailyReplyCounts>;
  /** Bumps this conversation's notice counter for today; null on error. Must not throw. */
  incrementNoticeCounter: (conversationId: string) => Promise<number | null>;
  flagConversation: () => Promise<void>;
  alertCapReached: (which: "global" | "business") => void;
  alertCounterUnavailable: () => void;
  log: (event: string, fields: Record<string, string>, level: "info" | "error") => void;
  nowMs: () => number;
};

/**
 * The orchestration behind lib/daily-reply-limit.ts's checkDailyReplyLimit(),
 * with every side effect injected so the tests drive each failure path. Never
 * throws: a flag failure is logged and the verdict stands.
 */
export async function runDailyReplyLimit(
  deps: DailyReplyLimitDeps,
  params: {
    channel: DailyLimitChannel;
    businessId: string;
    conversationId: string;
    inboundAtMs: number | null;
    caps: DailyReplyCaps;
  },
): Promise<DailyReplyLimitResult> {
  let counts: DailyReplyCounts;
  try {
    counts = await deps.incrementDailyCounters(params.businessId, params.caps);
  } catch {
    counts = { business: null, global: null };
  }
  const verdict = dailyLimitVerdict(counts, params.caps);

  for (const which of capsCrossedByThisRequest(counts, params.caps)) deps.alertCapReached(which);

  if (verdict.allowed) return verdict;

  // Every blocked message is logged (info, so a long outage or a busy capped
  // tenant can't flood Sentry); the error-level signal is the alert, which is
  // once per cap per day, or throttled for a counter outage.
  deps.log("gemini_daily_cap_blocked", { channel: params.channel, cap: verdict.reason }, "info");
  if (verdict.reason === "counter_unavailable") deps.alertCounterUnavailable();

  try {
    await deps.flagConversation();
  } catch {
    deps.log("gemini_daily_cap_flag_failed", { channel: params.channel }, "error");
  }

  // The website's notice is the response to the visitor's own request, so it
  // needs no counter; the push channels do.
  let noticeCount: number | null = null;
  if (params.channel !== "website") {
    try {
      noticeCount = await deps.incrementNoticeCounter(params.conversationId);
    } catch {
      noticeCount = null;
    }
  }
  const notice = limitNoticeDecision({
    channel: params.channel,
    inboundAtMs: params.inboundAtMs,
    nowMs: deps.nowMs(),
    noticeCount,
  });
  if (notice !== "send") deps.log("gemini_daily_cap_notice_skipped", { channel: params.channel, notice }, "info");
  return { allowed: false, reason: verdict.reason, notice };
}

/** WhatsApp's `timestamp` is epoch SECONDS as a string. Anything else is unknown. */
export function whatsappTimestampToMs(timestamp: string | undefined): number | null {
  if (!timestamp || !/^\d{9,11}$/.test(timestamp)) return null;
  return Number(timestamp) * 1000;
}
