import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createMessage } from "@/lib/messages";
import { createWhatsappOutboundMessage, sendWhatsappOutboundMessage } from "@/lib/whatsapp-delivery";
import { createInstagramOutboundMessage, deliverInstagramOutbound } from "@/lib/instagram-delivery";
import { reportChannelReplyFailure } from "@/lib/channel-reply-failure";
import { decideRecovery, REPLY_FAILED_FALLBACK_MESSAGE, type ReplyChannel } from "@/lib/channel-reply-rules";
import { logEvent } from "@/lib/logger";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Recovery sweep for "inbound stored, no reply sent" (LAUNCH_AUDIT.md §2 and
 * blocker B4). The webhook writes the dedup row (reply_status 'pending')
 * before replying, so a Meta redelivery can never cause a duplicate -- but a
 * reply lost after the 200 (instance killed inside after(), a deploy, a
 * crash) used to vanish. Every few minutes the scheduler claims inbound rows
 * still 'pending' after STUCK_AFTER_SECONDS and:
 *   - a reply already exists after the message -> mark 'replied' (only the
 *     status write was lost; nothing is sent);
 *   - a human owns the thread -> mark 'skipped';
 *   - otherwise -> flag the conversation for the team, send the safe fallback
 *     (each channel's own window rules still apply), mark 'recovered'.
 * It never re-runs the AI: a late, possibly duplicate AI answer is worse
 * than an honest "our team will get back to you".
 */

const STUCK_AFTER_SECONDS = 5 * 60;
/** Older than this, a fallback is more confusing than useful; the row is left for the team. */
const MAX_AGE_SECONDS = 6 * 60 * 60;
const MAX_PER_CHANNEL_PER_RUN = 20;

type ClaimedInbound = { id: string; business_id: string; conversation_id: string | null; created_at: string };

export type InboundRecoveryResult = {
  claimed: number;
  alreadyReplied: number;
  skipped: number;
  recovered: number;
  failed: number;
};

const INBOUND_TABLE: Record<ReplyChannel, string> = {
  whatsapp: "whatsapp_inbound_messages",
  instagram: "instagram_inbound_messages",
};

export async function recoverStuckInboundReplies(): Promise<InboundRecoveryResult> {
  const supabase = createServiceSupabaseClient();
  const total: InboundRecoveryResult = { claimed: 0, alreadyReplied: 0, skipped: 0, recovered: 0, failed: 0 };
  for (const channel of ["whatsapp", "instagram"] as const) {
    const result = await recoverChannel(supabase, channel);
    total.claimed += result.claimed;
    total.alreadyReplied += result.alreadyReplied;
    total.skipped += result.skipped;
    total.recovered += result.recovered;
    total.failed += result.failed;
  }
  return total;
}

async function recoverChannel(supabase: ServiceSupabaseClient, channel: ReplyChannel): Promise<InboundRecoveryResult> {
  const result: InboundRecoveryResult = { claimed: 0, alreadyReplied: 0, skipped: 0, recovered: 0, failed: 0 };
  const { data, error } = await supabase.rpc("claim_stuck_inbound_replies", {
    p_channel: channel,
    p_stuck_after_seconds: STUCK_AFTER_SECONDS,
    p_max_age_seconds: MAX_AGE_SECONDS,
    p_limit: MAX_PER_CHANNEL_PER_RUN,
  });
  if (error) {
    logEvent("inbound_reply_recovery_claim_failed", "unknown", { channel }, "error");
    return result;
  }

  const rows = (data ?? []) as ClaimedInbound[];
  result.claimed = rows.length;
  for (const row of rows) {
    try {
      const outcome = await recoverOne(supabase, channel, row);
      if (outcome === "already_replied") result.alreadyReplied++;
      else if (outcome === "recovered") result.recovered++;
      else result.skipped++;
    } catch {
      result.failed++;
      logEvent(`${channel}_reply_recovery_failed`, row.business_id, { inboundId: row.id }, "error");
      await setStatusById(supabase, channel, row.id, "failed");
    }
  }
  return result;
}

async function setStatusById(
  supabase: ServiceSupabaseClient,
  channel: ReplyChannel,
  inboundId: string,
  status: "replied" | "skipped" | "failed" | "recovered",
): Promise<void> {
  const table = INBOUND_TABLE[channel];
  await supabase.from(table).update({ reply_status: status, reply_updated_at: new Date().toISOString() }).eq("id", inboundId);
}

async function recoverOne(
  supabase: ServiceSupabaseClient,
  channel: ReplyChannel,
  row: ClaimedInbound,
): Promise<"already_replied" | "recovered" | "skipped"> {
  const conversation = row.conversation_id
    ? (
        await supabase
          .from("conversations")
          .select("id, control, visitor_id")
          .eq("business_id", row.business_id)
          .eq("id", row.conversation_id)
          .maybeSingle<{ id: string; control: "ai" | "human"; visitor_id: string | null }>()
      ).data
    : null;

  let replyAfterInbound = false;
  if (conversation) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", row.business_id)
      .eq("conversation_id", conversation.id)
      .in("role", ["assistant", "human_agent"])
      .gte("created_at", row.created_at);
    replyAfterInbound = (count ?? 0) > 0;
  }

  const decision = decideRecovery({
    conversationExists: Boolean(conversation?.visitor_id),
    control: conversation?.control ?? null,
    replyAfterInbound,
  });

  if (decision === "already_replied") {
    await setStatusById(supabase, channel, row.id, "replied");
    return "already_replied";
  }
  if (decision !== "send_fallback" || !conversation?.visitor_id) {
    await setStatusById(supabase, channel, row.id, "skipped");
    return "skipped";
  }

  await reportChannelReplyFailure({
    supabase,
    channel,
    businessId: row.business_id,
    conversationId: conversation.id,
    clerkOrgId: null,
    error: new Error(`${channel} reply never completed (recovered by sweep)`),
    stage: "recovery_sweep",
  });

  const messageRow = await createMessage(supabase, row.business_id, conversation.id, "assistant", REPLY_FAILED_FALLBACK_MESSAGE);
  if (channel === "whatsapp") {
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("phone_number_id, status")
      .eq("business_id", row.business_id)
      .maybeSingle<{ phone_number_id: string; status: string }>();
    if (connection?.status === "connected") {
      const outbound = await createWhatsappOutboundMessage(supabase, {
        businessId: row.business_id,
        conversationId: conversation.id,
        messageId: messageRow.id,
        toWaId: conversation.visitor_id,
        phoneNumberId: connection.phone_number_id,
        content: REPLY_FAILED_FALLBACK_MESSAGE,
      });
      await sendWhatsappOutboundMessage(outbound.id);
    }
  } else {
    const { data: connection } = await supabase
      .from("instagram_connections")
      .select("instagram_business_account_id, status")
      .eq("business_id", row.business_id)
      .maybeSingle<{ instagram_business_account_id: string; status: string }>();
    if (connection?.status === "connected") {
      const outbound = await createInstagramOutboundMessage(supabase, {
        businessId: row.business_id,
        conversationId: conversation.id,
        messageId: messageRow.id,
        toIgId: conversation.visitor_id,
        instagramBusinessAccountId: connection.instagram_business_account_id,
        content: REPLY_FAILED_FALLBACK_MESSAGE,
      });
      await deliverInstagramOutbound(outbound, supabase);
    }
  }

  await setStatusById(supabase, channel, row.id, "recovered");
  logEvent(`${channel}_reply_recovered`, row.business_id, { inboundId: row.id, conversationId: conversation.id });
  return "recovered";
}

