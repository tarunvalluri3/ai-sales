import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { AppError } from "@/lib/errors";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Phase 26's Instagram reply-send queue -- near-verbatim port of
 * lib/whatsapp-delivery.ts's claim/backoff/dead-letter shape. A row is
 * written and an immediate send is attempted inline in the same request
 * that produced the reply (the webhook handler's AI-reply path); this
 * queue exists as the retry backstop for when that immediate attempt
 * fails, not as the primary delivery path. Swept by the same shared
 * daily cron as every other background queue this app has.
 */

const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 60 * 60;
const DELIVERY_TIMEOUT_MS = 10_000;
const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

export type CreateInstagramOutboundMessageInput = {
  businessId: string;
  conversationId: string;
  messageId: string;
  toIgId: string;
  instagramBusinessAccountId: string;
  content: string;
};

/** Enqueues a reply for sending. Returns the created row's id, to pass to sendInstagramOutboundMessage(). */
export async function createInstagramOutboundMessage(
  supabase: ServiceSupabaseClient,
  input: CreateInstagramOutboundMessageInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("instagram_outbound_messages")
    .insert({
      business_id: input.businessId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      to_ig_id: input.toIgId,
      instagram_business_account_id: input.instagramBusinessAccountId,
      content: input.content,
    })
    .select("id")
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong queuing this Instagram reply.",
      "createInstagramOutboundMessage failed",
      error,
    );
  }

  return data;
}

function backoffSeconds(attempts: number): number {
  return Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
}

function errorMessageOnly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

type InstagramOutboundRow = {
  id: string;
  business_id: string;
  instagram_business_account_id: string;
  to_ig_id: string;
  content: string;
  attempts: number;
};

/**
 * Sends one queued reply via Meta's Graph API. Never throws -- every
 * outcome (including a missing/errored connection or credential) is
 * recorded on the row itself and reflected in the return value, matching
 * lib/whatsapp-delivery.ts's contract.
 */
export async function sendInstagramOutboundMessage(outboundId: string): Promise<{ success: boolean }> {
  const supabase = createServiceSupabaseClient();

  const { data: outbound } = await supabase
    .from("instagram_outbound_messages")
    .select("id, business_id, instagram_business_account_id, to_ig_id, content, attempts")
    .eq("id", outboundId)
    .maybeSingle<InstagramOutboundRow>();

  if (!outbound) {
    return { success: false };
  }

  return deliverInstagramOutboundRow(supabase, outbound);
}

async function deliverInstagramOutboundRow(
  supabase: ServiceSupabaseClient,
  outbound: InstagramOutboundRow,
): Promise<{ success: boolean }> {
  const { data: credentials } = await supabase
    .from("instagram_credentials")
    .select("access_token")
    .eq("business_id", outbound.business_id)
    .maybeSingle<{ access_token: string }>();

  if (!credentials) {
    await supabase
      .from("instagram_outbound_messages")
      .update({ status: "failed", last_error: "No Instagram credentials for this business.", updated_at: new Date().toISOString() })
      .eq("id", outbound.id);
    return { success: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(outbound.instagram_business_account_id)}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.access_token}`,
        },
        body: JSON.stringify({
          recipient: { id: outbound.to_ig_id },
          message: { text: outbound.content },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Graph API responded with status ${response.status}`);
    }

    const body = (await response.json()) as { message_id?: string };
    const igMessageId = body.message_id ?? null;

    await supabase
      .from("instagram_outbound_messages")
      .update({
        status: "sent",
        ig_message_id: igMessageId,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbound.id);

    logEvent("instagram_delivery_succeeded", outbound.business_id, { outboundId: outbound.id });
    return { success: true };
  } catch (error) {
    const attempts = outbound.attempts + 1;
    const isDeadLetter = attempts >= MAX_DELIVERY_ATTEMPTS;

    await supabase
      .from("instagram_outbound_messages")
      .update({
        status: isDeadLetter ? "failed" : "pending",
        attempts,
        last_error: errorMessageOnly(error),
        next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbound.id);

    logEvent(
      isDeadLetter ? "instagram_delivery_dead_lettered" : "instagram_delivery_retry_scheduled",
      outbound.business_id,
      { outboundId: outbound.id, attempts },
      isDeadLetter ? "error" : undefined,
    );
    return { success: false };
  }
}

export type ProcessInstagramOutboundResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

/** Sweeps pending/backed-off deliveries. Called from the shared daily cron backstop. */
export async function processInstagramOutboundMessages(): Promise<ProcessInstagramOutboundResult> {
  const supabase = createServiceSupabaseClient();

  const { data: claimed, error: claimError } = await supabase.rpc("claim_instagram_outbound_messages", {
    p_limit: MAX_DELIVERIES_PER_RUN,
  });

  if (claimError) {
    logEvent("instagram_delivery_claim_failed", "unknown", {}, "error");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const rows = (claimed ?? []) as InstagramOutboundRow[];
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await deliverInstagramOutboundRow(supabase, row);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: rows.length, succeeded, failed };
}
