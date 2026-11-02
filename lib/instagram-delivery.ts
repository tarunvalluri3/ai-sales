import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { graphRequest } from "@/lib/meta-graph";
import { getInstagramAccessToken, getInstagramSendNode, markInstagramConnectionRevoked } from "@/lib/instagram";
import { flagConversationNeedsAttention } from "@/lib/conversations";
import { isInstagramAllowed } from "@/lib/subscription";
import { isOutsideWindowError, isRevokedTokenError, isWithinMessagingWindow } from "@/lib/meta-instagram-rules";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Instagram reply-send queue (claim/backoff/dead-letter, same shape as
 * lib/whatsapp-delivery.ts). A row is written and an immediate send is
 * attempted inline; the shared daily cron retries failures.
 *
 * Facebook Login connections (default): POST graph.facebook.com/<PAGE_ID>/messages
 * with the stored Page access token (Meta: Instagram Messaging "Send a
 * message"). Unified Login connections: POST /<IG account id>/messages with
 * the system user token. The node comes from the connection row
 * (getInstagramSendNode). These rules are enforced here, at
 * the one place every Instagram send goes through (AI replies, staff
 * replies, appointment notices, cron retries):
 *  - Instagram must be allowed for the business (a plan that includes it,
 *    or the service-role-only `businesses.instagram_enabled` override);
 *  - the 24-hour window: no send unless the person's last message is under
 *    24 hours old; otherwise the row fails as `outside_24h_window` and the
 *    conversation is flagged for the team (no HUMAN_AGENT tag yet);
 *  - a revoked or invalid token (Graph code 190): the token is deleted, the
 *    connection marked disconnected (the dashboard shows "Reconnect"), and
 *    the row fails without retries.
 */

const MAX_DELIVERIES_PER_RUN = 10;
const OUTBOUND_COLUMNS = "id, business_id, conversation_id, instagram_business_account_id, to_ig_id, content, attempts";
const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 60 * 60;

export type CreateInstagramOutboundMessageInput = {
  businessId: string;
  conversationId: string;
  messageId: string;
  toIgId: string;
  instagramBusinessAccountId: string;
  content: string;
};

/**
 * Enqueues a reply for sending. Returns the created row: pass its id to
 * sendInstagramOutboundMessage(), or the row itself to
 * deliverInstagramOutbound() to skip reading it straight back.
 */
export async function createInstagramOutboundMessage(
  supabase: ServiceSupabaseClient,
  input: CreateInstagramOutboundMessageInput,
): Promise<InstagramOutboundRow> {
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
    .select(OUTBOUND_COLUMNS)
    .single<InstagramOutboundRow>();

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

export type InstagramOutboundRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  instagram_business_account_id: string;
  to_ig_id: string;
  content: string;
  attempts: number;
};

export type InstagramSendResult = {
  success: boolean;
  reason?: "not_allowed" | "outside_window" | "token_revoked" | "no_credentials" | "retry_scheduled" | "failed";
};

/**
 * Sends one queued reply. Never throws -- every outcome is recorded on the
 * row itself and reflected in the return value.
 */
export async function sendInstagramOutboundMessage(outboundId: string): Promise<InstagramSendResult> {
  const supabase = createServiceSupabaseClient();

  const { data: outbound } = await supabase
    .from("instagram_outbound_messages")
    .select(OUTBOUND_COLUMNS)
    .eq("id", outboundId)
    .maybeSingle<InstagramOutboundRow>();

  if (!outbound) {
    return { success: false, reason: "failed" };
  }

  return deliverInstagramOutbound(outbound, supabase);
}

/**
 * Sends a row the caller has just created (createInstagramOutboundMessage's
 * return value) without reading it back first. Same rules and outcomes as
 * sendInstagramOutboundMessage(). Never throws.
 */
export async function deliverInstagramOutbound(
  outbound: InstagramOutboundRow,
  supabase: ServiceSupabaseClient = createServiceSupabaseClient(),
): Promise<InstagramSendResult> {
  try {
    return await deliverInstagramOutboundRow(supabase, outbound);
  } catch {
    logEvent("instagram_delivery_unexpected_error", outbound.business_id, { outboundId: outbound.id }, "error");
    return { success: false, reason: "failed" };
  }
}

async function failRow(supabase: ServiceSupabaseClient, outboundId: string, lastError: string): Promise<void> {
  await supabase
    .from("instagram_outbound_messages")
    .update({ status: "failed", last_error: lastError, updated_at: new Date().toISOString() })
    .eq("id", outboundId);
}

/** When the person last wrote to the business in this conversation (inbound rows are role `user`). */
async function lastInboundAt(
  supabase: ServiceSupabaseClient,
  businessId: string,
  conversationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("messages")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  return data?.created_at ?? null;
}

async function flagOutsideWindow(supabase: ServiceSupabaseClient, outbound: InstagramOutboundRow): Promise<void> {
  await failRow(supabase, outbound.id, "outside_24h_window");
  const { data: business } = await supabase
    .from("businesses")
    .select("clerk_org_id")
    .eq("id", outbound.business_id)
    .maybeSingle<{ clerk_org_id: string }>();
  if (business) {
    await flagConversationNeedsAttention(supabase, outbound.business_id, outbound.conversation_id, business.clerk_org_id);
  }
  logEvent("instagram_send_outside_window", outbound.business_id, {
    outboundId: outbound.id,
    conversationId: outbound.conversation_id,
  });
}

async function deliverInstagramOutboundRow(
  supabase: ServiceSupabaseClient,
  outbound: InstagramOutboundRow,
): Promise<InstagramSendResult> {
  // The four reads are independent, so they run as one parallel round trip
  // (2026-11-02 latency pass) instead of four in a row. The gates below are
  // still checked in the same order, and Meta is called only if all pass.
  const [allowed, lastInbound, token, sendNode] = await Promise.all([
    // The one place every send passes through (AI, staff, appointment notices,
    // cron retries): no plan with Instagram and no override means no send.
    isInstagramAllowed(supabase, outbound.business_id),
    lastInboundAt(supabase, outbound.business_id, outbound.conversation_id),
    getInstagramAccessToken(supabase, outbound.business_id),
    getInstagramSendNode(supabase, outbound.business_id),
  ]);

  if (!allowed) {
    await failRow(supabase, outbound.id, "instagram_not_allowed");
    logEvent("instagram_send_not_allowed", outbound.business_id, { outboundId: outbound.id });
    return { success: false, reason: "not_allowed" };
  }

  if (!isWithinMessagingWindow(lastInbound, new Date())) {
    await flagOutsideWindow(supabase, outbound);
    return { success: false, reason: "outside_window" };
  }

  if (!token) {
    await failRow(supabase, outbound.id, "No Instagram credentials for this business.");
    return { success: false, reason: "no_credentials" };
  }

  if (!sendNode) {
    await failRow(supabase, outbound.id, "No Instagram connection for this business.");
    return { success: false, reason: "no_credentials" };
  }

  const result = await graphRequest<{ message_id?: string }>(
    "POST",
    `/${sendNode}/messages`,
    {
      token,
      json: { recipient: { id: outbound.to_ig_id }, message: { text: outbound.content } },
    },
  );

  if (result.ok) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("instagram_outbound_messages")
      .update({ status: "sent", ig_message_id: result.data.message_id ?? null, sent_at: nowIso, updated_at: nowIso })
      .eq("id", outbound.id);
    logEvent("instagram_delivery_succeeded", outbound.business_id, { outboundId: outbound.id });
    return { success: true };
  }

  if (isRevokedTokenError(result.status, result.error)) {
    await failRow(supabase, outbound.id, "token_revoked");
    await markInstagramConnectionRevoked(supabase, outbound.business_id);
    return { success: false, reason: "token_revoked" };
  }

  if (isOutsideWindowError(result.error)) {
    await flagOutsideWindow(supabase, outbound);
    return { success: false, reason: "outside_window" };
  }

  const attempts = outbound.attempts + 1;
  const isDeadLetter = attempts >= MAX_DELIVERY_ATTEMPTS;
  await supabase
    .from("instagram_outbound_messages")
    .update({
      status: isDeadLetter ? "failed" : "pending",
      attempts,
      last_error: `Graph API responded with status ${result.status}${result.error?.code ? ` (code ${result.error.code})` : ""}`,
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
  return { success: false, reason: isDeadLetter ? "failed" : "retry_scheduled" };
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
    let result: InstagramSendResult;
    try {
      result = await deliverInstagramOutboundRow(supabase, row);
    } catch {
      result = { success: false, reason: "failed" };
    }
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: rows.length, succeeded, failed };
}
export type InstagramSenderAction = "mark_seen" | "typing_on" | "typing_off";

/**
 * Meta sender actions (Messenger Platform for Instagram, "Sender Actions",
 * read 2026-11-02): POST /<PAGE_ID>/messages with ONLY `recipient` and
 * `sender_action` (`mark_seen`, `typing_on`, `typing_off`) and the Page
 * token. The message itself must be a separate request. Instagram cannot
 * stream a reply, so "Seen" plus "typing..." is what makes the wait feel
 * short.
 *
 * Perceived speed only: the caller starts this without awaiting it on the
 * reply path, and only once it knows the agent will reply. Uses the same
 * Graph node and token as replies. NEVER throws; a failure is logged with
 * the Graph status only.
 */
export async function sendInstagramSenderActions(
  supabase: ServiceSupabaseClient,
  businessId: string,
  toIgId: string,
  actions: InstagramSenderAction[],
): Promise<void> {
  try {
    const [token, sendNode] = await Promise.all([
      getInstagramAccessToken(supabase, businessId),
      getInstagramSendNode(supabase, businessId),
    ]);
    if (!token || !sendNode) return;
    const results = await Promise.all(
      actions.map((action) =>
        graphRequest("POST", `/${sendNode}/messages`, {
          token,
          json: { recipient: { id: toIgId }, sender_action: action },
        }),
      ),
    );
    results.forEach((result, index) => {
      if (!result.ok) {
        logEvent("instagram_sender_action_failed", businessId, { action: actions[index], status: result.status });
      }
    });
  } catch {
    logEvent("instagram_sender_action_failed", businessId, { action: actions.join(","), status: 0 });
  }
}
