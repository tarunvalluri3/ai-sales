import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import { flagConversationNeedsAttention } from "@/lib/conversations";
import { classifyGeminiError, type GeminiErrorKind } from "@/lib/gemini-errors";
import { logEvent } from "@/lib/logger";
import { REPLY_FAILED_FALLBACK_MESSAGE, type InboundReplyStatus, type ReplyChannel } from "@/lib/channel-reply-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export { REPLY_FAILED_FALLBACK_MESSAGE };

const INBOUND_TABLE: Record<ReplyChannel, { table: string; idColumn: string }> = {
  whatsapp: { table: "whatsapp_inbound_messages", idColumn: "whatsapp_message_id" },
  instagram: { table: "instagram_inbound_messages", idColumn: "instagram_message_id" },
};

/**
 * Records what happened to one inbound message's reply (migration
 * 20261115000000). Never throws: a tracking write must not break the reply
 * path. A row left `pending` is what the recovery sweep looks for
 * (lib/inbound-reply-recovery.ts), so every path that finishes -- with or
 * without a reply -- marks it.
 */
export async function markInboundReplyStatus(
  supabase: ServiceSupabaseClient,
  channel: ReplyChannel,
  businessId: string,
  providerMessageId: string,
  status: InboundReplyStatus,
): Promise<void> {
  const { table, idColumn } = INBOUND_TABLE[channel];
  try {
    const { error } = await supabase
      .from(table)
      .update({ reply_status: status, reply_updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq(idColumn, providerMessageId);
    if (error) logEvent(`${channel}_reply_status_write_failed`, businessId, { status }, "error");
  } catch {
    logEvent(`${channel}_reply_status_write_failed`, businessId, { status }, "error");
  }
}

export type ReplyFailureReport = {
  kind: GeminiErrorKind;
  flagged: boolean;
};

/**
 * Makes a failed WhatsApp/Instagram reply visible everywhere it needs to be
 * (LAUNCH_AUDIT.md §1, blocker B4): Sentry gets the exception with the
 * channel and error kind as tags, a `<channel>_reply_failed` error event is
 * logged (alertable), and the conversation is flagged `needs_attention` so it
 * shows in the business's inbox. Sending the fallback text is the caller's
 * job (each channel has its own send path and window rules).
 *
 * Never throws. Never logs message text or tokens -- ids and enums only.
 */
export async function reportChannelReplyFailure(params: {
  supabase: ServiceSupabaseClient;
  channel: ReplyChannel;
  businessId: string;
  conversationId: string;
  clerkOrgId: string | null;
  error: unknown;
  /** Where it failed, e.g. "ai_reply" or "recovery_sweep". */
  stage: string;
}): Promise<ReplyFailureReport> {
  const { supabase, channel, businessId, conversationId, error, stage } = params;
  const kind = classifyGeminiError(error);

  try {
    Sentry.captureException(error, {
      tags: { channel, reply_failure_kind: kind, reply_failure_stage: stage },
      extra: { businessId, conversationId },
    });
  } catch {
    // Sentry must never break the reply path.
  }
  logEvent(`${channel}_reply_failed`, businessId, { conversationId, kind, stage }, "error");

  let flagged = false;
  try {
    const clerkOrgId = params.clerkOrgId ?? (await lookupClerkOrgId(supabase, businessId));
    if (clerkOrgId) {
      await flagConversationNeedsAttention(supabase, businessId, conversationId, clerkOrgId);
      flagged = true;
    }
  } catch {
    logEvent(`${channel}_reply_failure_flag_failed`, businessId, { conversationId }, "error");
  }

  return { kind, flagged };
}

async function lookupClerkOrgId(supabase: ServiceSupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from("businesses")
    .select("clerk_org_id")
    .eq("id", businessId)
    .maybeSingle<{ clerk_org_id: string }>();
  return data?.clerk_org_id ?? null;
}
