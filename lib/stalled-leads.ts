import "server-only";
import { Resend } from "resend";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getChatModel } from "@/lib/rag";
import { WHATSAPP_CONVERSATION_SOURCE } from "@/lib/whatsapp";
import { SANDBOX_CONVERSATION_SOURCE } from "@/lib/conversations";
import { logEvent } from "@/lib/logger";
import type { LeadFollowUpStatus, LeadInterestType } from "@/lib/supabase/types";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a lead's conversation must have gone quiet before it counts
// as "stalled" -- short enough to still be a warm prospect, long enough
// that this isn't just a normal pause mid-conversation.
const STALLED_DAYS = 3;
const MAX_LEADS_CHECKED_PER_RUN = 25;
const MAX_DRAFT_LENGTH = 1000;

const DEFAULT_FROM = "Waves AI Pilot <onboarding@resend.dev>";

export type StalledLeadSweepResult = {
  checked: number;
  sentEmail: number;
  blockedWhatsapp: number;
  noChannel: number;
  failed: number;
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
 * giving up).
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
  const result: StalledLeadSweepResult = { checked: 0, sentEmail: 0, blockedWhatsapp: 0, noChannel: 0, failed: 0 };

  const { data: candidates, error } = await supabase
    .from("leads")
    .select(
      "id, business_id, conversation_id, contact_name, contact_email, contact_phone, interest_type, interest_id, notes, follow_up_message, created_at",
    )
    .in("status", ["new", "contacted"])
    .is("follow_up_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_LEADS_CHECKED_PER_RUN);

  if (error || !candidates) {
    logEvent("stalled_lead_sweep_query_failed", "unknown", {}, "error");
    return result;
  }

  const cutoffMs = Date.now() - STALLED_DAYS * DAY_MS;

  for (const lead of candidates as CandidateLead[]) {
    result.checked++;
    try {
      const outcome = await processCandidate(supabase, lead, cutoffMs);
      if (outcome === "sent_email") result.sentEmail++;
      else if (outcome === "blocked_no_whatsapp_template") result.blockedWhatsapp++;
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
    .select("name")
    .eq("id", lead.business_id)
    .maybeSingle();
  const businessName = business?.name ?? "our team";

  let message = lead.follow_up_message;
  if (!message) {
    message = await draftFollowUpMessage(supabase, businessName, lead);
    await supabase.from("leads").update({ follow_up_message: message }).eq("id", lead.id);
  }

  if (lead.contact_email) {
    return sendFollowUpEmail(supabase, lead, businessName, message);
  }

  if (conversation.source === WHATSAPP_CONVERSATION_SOURCE) {
    await supabase.from("leads").update({ follow_up_status: "blocked_no_whatsapp_template" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "no_whatsapp_template" });
    return "blocked_no_whatsapp_template";
  }

  await supabase.from("leads").update({ follow_up_status: "no_contact_channel" }).eq("id", lead.id);
  logEvent("stalled_lead_follow_up_blocked", lead.business_id, { leadId: lead.id, reason: "no_contact_channel" });
  return "no_contact_channel";
}

async function sendFollowUpEmail(
  supabase: ServiceSupabaseClient,
  lead: CandidateLead,
  businessName: string,
  message: string,
): Promise<Outcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Left un-set (no follow_up_status write): retried tomorrow once a
    // sending domain exists, same degrade-safe contract as
    // lib/notifications.ts's own digest.
    logEvent("stalled_lead_follow_up_skipped_no_api_key", lead.business_id, { leadId: lead.id });
    return "skipped";
  }

  const resend = new Resend(apiKey);
  const from = process.env.NOTIFICATION_EMAIL_FROM || DEFAULT_FROM;

  try {
    const { error } = await resend.emails.send({
      from,
      to: lead.contact_email!,
      subject: `Following up — ${businessName}`,
      text: `${message}\n\n— The ${businessName} team`,
    });

    if (error) {
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
  } catch {
    await supabase.from("leads").update({ follow_up_status: "send_failed" }).eq("id", lead.id);
    logEvent("stalled_lead_follow_up_send_failed", lead.business_id, { leadId: lead.id }, "error");
    return "send_failed";
  }
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
