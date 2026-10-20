import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getChatModel } from "@/lib/rag";
import { WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { INSTAGRAM_CONVERSATION_SOURCE } from "@/lib/instagram";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { logEvent } from "@/lib/logger";
import { renderBrandedEmail } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sender";
import type { LeadFollowUpStatus, LeadInterestType } from "@/lib/supabase/types";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a lead's conversation must have gone quiet before it counts
// as "stalled" -- short enough to still be a warm prospect, long enough
// that this isn't just a normal pause mid-conversation.
const STALLED_DAYS = 3;
const MAX_LEADS_CHECKED_PER_RUN = 25;
const MAX_DRAFT_LENGTH = 1000;

// A lead the sweep has already examined is left alone for this long before
// it is eligible again. Deliberately under 24h: the Vercel cron fires daily
// but not to the second, so a run can land a few minutes later than
// yesterday's. With a 24h window, a lead stamped at the end of yesterday's
// run would still be inside the window at the start of today's slightly
// earlier-by-the-clock run and get skipped for a whole extra day.
const FOLLOW_UP_RETRY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export type StalledLeadSweepResult = {
  checked: number;
  sentEmail: number;
  blockedWhatsapp: number;
  blockedInstagram: number;
  /** The lead's email previously hard-bounced or reported spam (lib/email-suppression.ts). */
  blockedSuppressed: number;
  noChannel: number;
  failed: number;
  /** Open, unsent leads left out of this run because they were attempted inside the retry cooldown. */
  skippedCooldown: number;
};

type CandidateLead = {
  id: string;
  business_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  interest_type: LeadInterestType | null;
  interest_id: string | null;
  notes: string | null;
  follow_up_message: string | null;
  created_at: string;
};

type Outcome = "not_stalled" | "skipped" | LeadFollowUpStatus | "failed";

/**
 * Stalled-lead re-engagement sweep (user-requested, 2026-09-10, see
 * STATE.md) -- part of the shared daily cron backstop, same "no
 * dedicated worker" reasoning as lib/sla-routing.ts and
 * lib/notifications.ts. Finds leads still `new`/`contacted` whose
 * conversation has had no new message in STALLED_DAYS, drafts one
 * short AI follow-up grounded only in that lead's own captured
 * notes/interest (never invents facts, same discipline as lib/rag.ts's
 * SYSTEM_TEMPLATE), and sends it at most once per lead
 * (`leads.follow_up_sent_at` is the gate -- see the migration's
 * comment for why a blocked/failed attempt leaves it null instead of
 * giving up). Because those leads stay eligible, `follow_up_attempted_at`
 * (20261020000000) records every examination whatever its outcome, and the
 * query skips recently attempted leads and takes the least recently
 * attempted first -- otherwise the oldest 25 blocked leads would fill every
 * run forever and starve every newer lead.
 *
 * Email send degrades safely exactly like sendDailyDigestEmails() when
 * `RESEND_API_KEY` is unset. WhatsApp send is deliberately NOT
 * implemented: Meta only allows a business-initiated message outside
 * the 24-hour customer-service window (which every stalled lead is, by
 * definition) through a template pre-approved in Meta Business
 * Manager -- this app has no such template and cannot fabricate one
 * (AGENTS.md's no-fabricated-business-facts rule applies here too). A
 * WhatsApp-only lead is recorded as `blocked_no_whatsapp_template`
 * instead, visible on the leads dashboard, ready to wire up to a real
 * template send the day one exists.
 */
export async function runStalledLeadFollowUpSweep(): Promise<StalledLeadSweepResult> {
  const supabase = createServiceSupabaseClient();
  const result: StalledLeadSweepResult = {
    checked: 0,
    sentEmail: 0,
    blockedWhatsapp: 0,
    blockedInstagram: 0,
    blockedSuppressed: 0,
    noChannel: 0,
    failed: 0,
    skippedCooldown: 0,
  };

  const nowMs = Date.now();
  const attemptCutoffIso = new Date(nowMs - FOLLOW_UP_RETRY_COOLDOWN_MS).toISOString();

  // Counted before any lead is stamped, so it reports what the cooldown
  // excluded at selection time rather than including this run's own stamps.
  const [{ data: candidates, error }, { count: cooldownCount, error: cooldownCountError }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, business_id, conversation_id, contact_name, contact_email, contact_phone, interest_type, interest_id, notes, follow_up_message, created_at",
      )
      .in("status", ["new", "contacted"])
      .is("follow_up_sent_at", null)
      .or(`follow_up_attempted_at.is.null,follow_up_attempted_at.lt.${attemptCutoffIso}`)
      .order("follow_up_attempted_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(MAX_LEADS_CHECKED_PER_RUN),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "contacted"])
      .is("follow_up_sent_at", null)
      .gte("follow_up_attempted_at", attemptCutoffIso),
  ]);

  if (error || !candidates) {
    logEvent("stalled_lead_sweep_query_failed", "unknown", {}, "error");
    return result;
  }

  if (cooldownCountError) {
    // Reporting only -- the sweep itself is unaffected, so not worth a Sentry alert.
    logEvent("stalled_lead_sweep_cooldown_count_failed", "unknown");
  } else {
    result.skippedCooldown = cooldownCount ?? 0;
  }

  const cutoffMs = nowMs - STALLED_DAYS * DAY_MS;

  for (const lead of candidates as CandidateLead[]) {
    result.checked++;
    // Stamped before processing, not after, so that no outcome can escape it:
    // not the early returns inside processCandidate (not stalled yet, sandbox
    // conversation, no API key, each blocked_* state), not a thrown error, and
    // not a run killed mid-lead by the function timeout -- that lead is then
    // not first in line again tomorrow.
    await recordAttempt(supabase, lead);
    try {
      const outcome = await processCandidate(supabase, lead, cutoffMs);
      if (outcome === "sent_email") result.sentEmail++;
      else if (outcome === "blocked_no_whatsapp_template") result.blockedWhatsapp++;
      else if (outcome === "blocked_no_instagram_window") result.blockedInstagram++;
      else if (outcome === "blocked_email_suppressed") result.blockedSuppressed++;
      else if (outcome === "no_contact_channel") result.noChannel++;
      else if (outcome === "failed") result.failed++;
      // "not_stalled" / "skipped" (sandbox conversation) / "send_failed"
      // (retried tomorrow) intentionally don't move any counter beyond
      // `checked` -- they aren't sweep failures, just non-actions.
    } catch {
      result.failed++;
      logEvent("stalled_lead_follow_up_failed", lead.business_id, { leadId: lead.id }, "error");
    }
  }

  return result;
}

async function recordAttempt(supabase: ServiceSupabaseClient, lead: CandidateLead): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ follow_up_attempted_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("business_id", lead.business_id);

  // Not fatal to this lead's follow-up, but an unstamped lead can be picked
  // again tomorrow ahead of newer ones -- the starvation this column exists to
  // prevent -- so it is worth an alert.
  if (error) {
    logEvent("stalled_lead_attempt_stamp_failed", lead.business_id, { leadId: lead.id }, "error");
  }
}

async function processCandidate(
  supabase: ServiceSupabaseClient,
  lead: CandidateLead,
  cutoffMs: number,
): Promise<Outcome> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, source, visitor_id")
    .eq("id", lead.conversation_id)
    .maybeSingle();

  if (!conversation || conversation.source === SANDBOX_CONVERSATION_SOURCE) {
    return "skipped";
  }

  const { data: lastMessage } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", lead.conversation_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastActivityMs = new Date(lastMessage?.created_at ?? lead.created_at).getTime();
  if (lastActivityMs > cutoffMs) {
    return "not_stalled";
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name, contact_email")
    .eq("id", lead.business_id)
    .maybeSingle();
  const businessName = business?.name ?? "our team";
  const businessReplyTo: string | null = business?.contact_email ?? null;

  let message = lead.follow_up_message;
  if (!message) {
    message = await draftFollowUpMessage(supabase, businessName, lead);
    await supabase.from("leads").update({ follow_up_message: message }).eq("id", lead.id);
  }

  if (lead.contact_email) {
    return sendFollowUpEmail(supabase, lead, businessName, businessReplyTo, message);
  }

  if (conversation.source === WHATSAPP_CONVERSATION_SOURCE) {
    await supabase.from("leads").update({ follow_up_status: "blocked_no_whatsapp_template" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "no_whatsapp_template" });
    return "blocked_no_whatsapp_template";
  }

  // Instagram's constraint isn't the same shape as WhatsApp's -- there is
  // no pre-approved-template escape hatch at all for Instagram DMs (and
  // the HUMAN_AGENT 7-day tag is its own, deferred App Review track, per
  // STATE.md's Phase 26 research), so the accurate framing is the
  // 24-hour message window closing, not a missing template.
  if (conversation.source === INSTAGRAM_CONVERSATION_SOURCE) {
    await supabase.from("leads").update({ follow_up_status: "blocked_no_instagram_window" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "instagram_window_closed" });
    return "blocked_no_instagram_window";
  }

  await supabase.from("leads").update({ follow_up_status: "no_contact_channel" }).eq("id", lead.id);
  logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "no_contact_channel" });
  return "no_contact_channel";
}

async function sendFollowUpEmail(
  supabase: ServiceSupabaseClient,
  lead: CandidateLead,
  businessName: string,
  businessReplyTo: string | null,
  message: string,
): Promise<Outcome> {
  // 2026-10-19: this email speaks *for* the business to its own prospect,
  // and its whole purpose is to get a reply. It previously came from
  // "Waves AI Pilot" with no reply-to, so a prospect who answered was
  // writing to the notifications inbox and the business never saw it. Now:
  // "<Business> via Waves AI Pilot", replyTo the business's contact_email.
  // The AI-drafted message itself is unchanged, still the paragraph body.
  const outcome = await sendEmail({
    to: lead.contact_email!,
    subject: `Following up — ${businessName}`,
    onBehalfOf: businessName,
    replyTo: businessReplyTo,
    email: renderBrandedEmail({
      senderName: businessName,
      heading: `Following up from ${businessName}`,
      paragraphs: [...message.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean), `— The ${businessName} team`],
      footnote: businessReplyTo
        ? `Sent on behalf of ${businessName} by Waves AI Pilot. Replies go straight to ${businessName}.`
        : `Sent on behalf of ${businessName} by Waves AI Pilot.`,
    }),
  });

  if (outcome === "skipped_no_api_key") {
    // Left un-set (no follow_up_status write): retried tomorrow once a
    // sending domain exists, same degrade-safe contract as
    // lib/notifications.ts's own digest.
    logEvent("stalled_lead_follow_up_skipped_no_api_key", lead.business_id, { leadId: lead.id });
    return "skipped";
  }

  if (outcome === "suppressed") {
    // Previously Resend accepted this call and dropped the mail itself, so
    // the lead was recorded 'sent_email' with follow_up_sent_at set -- a
    // follow-up the dashboard reported as delivered that reached nobody.
    // Like the other blocked_* states, follow_up_sent_at stays null.
    await supabase.from("leads").update({ follow_up_status: "blocked_email_suppressed" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "email_suppressed" });
    return "blocked_email_suppressed";
  }

  if (outcome === "failed") {
    await supabase.from("leads").update({ follow_up_status: "send_failed" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_send_failed", lead.business_id, { leadId: lead.id }, "error");
    return "send_failed";
  }

  await supabase
    .from("leads")
    .update({ follow_up_status: "sent_email", follow_up_sent_at: new Date().toISOString() })
    .eq("id", lead.id);
  logEvent("stalled_lead_follow_up_sent", lead.business_id, { leadId: lead.id, channel: "email" });
  return "sent_email";
}

async function resolveInterestName(
  supabase: ServiceSupabaseClient,
  businessId: string,
  interestType: LeadInterestType | null,
  interestId: string | null,
): Promise<string | null> {
  if (!interestId || (interestType !== "product" && interestType !== "service")) return null;

  const table = interestType === "product" ? "products" : "services";
  const { data } = await supabase.from(table).select("name").eq("id", interestId).eq("business_id", businessId).maybeSingle();
  return data?.name ?? null;
}

const FALLBACK_MESSAGE = "Hi! Just checking in — are you still interested in what we discussed? Happy to help whenever you're ready.";

/**
 * Drafts one short, ungrounded-fact-free follow-up via Gemini -- the
 * only inputs are the lead's own captured notes/interest/name and the
 * business's name, the same "never invent a fact not in the provided
 * context" discipline as lib/rag.ts's SYSTEM_TEMPLATE. Falls back to a
 * generic, still-honest message on any model error rather than
 * blocking the send.
 */
async function draftFollowUpMessage(
  supabase: ServiceSupabaseClient,
  businessName: string,
  lead: CandidateLead,
): Promise<string> {
  const interestName = await resolveInterestName(supabase, lead.business_id, lead.interest_type, lead.interest_id);

  const contextLines = [
    lead.contact_name ? `Prospect's name: ${lead.contact_name}` : null,
    interestName ? `What they showed interest in: ${interestName}` : null,
    lead.notes ? `Notes from the earlier conversation: ${lead.notes}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const prompt = `You are drafting one short follow-up message on behalf of "${businessName}" to a prospect who went quiet a few days ago after an earlier chat conversation. Write 2-3 warm, natural sentences using ONLY the facts given below -- never invent a price, discount, availability, or promise that isn't stated. End with a soft, low-pressure question inviting them to continue. No greeting like "Dear", no sign-off (one is added separately). Plain text only, no markdown.

${contextLines || "(No further details were captured from the earlier conversation.)"}`;

  try {
    const response = await getChatModel().invoke(prompt);
    const text = typeof response.content === "string" ? response.content : String(response.content ?? "");
    const trimmed = text.trim().slice(0, MAX_DRAFT_LENGTH);
    return trimmed || FALLBACK_MESSAGE;
  } catch {
    return FALLBACK_MESSAGE;
  }
}
