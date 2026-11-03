import "server-only";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { flagConversationNeedsAttention } from "@/lib/conversations";
import {
  buildWhatsappPayload,
  classifyWhatsappSendError,
  decideWhatsappSend,
  isRetryableWhatsappError,
  isWithinWhatsappWindow,
  readWhatsappGraphError,
  type WhatsappSendErrorClass,
  type WhatsappTemplateRef,
} from "@/lib/whatsapp-rules";
import type { ResolvedWhatsappTemplate, WhatsappTemplateKind } from "@/lib/whatsapp-templates";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/**
 * Phase 16's WhatsApp reply-send queue -- same claim/backoff/dead-letter
 * shape as lib/webhook-delivery.ts (Phase 24), reused deliberately. A
 * row is written and an immediate send is attempted inline, in the same
 * request that produced the reply (the webhook handler's AI-reply path,
 * the dashboard's human-reply action, an appointment notice); this queue is
 * the retry backstop, swept by the scheduler every minute
 * (lib/scheduler/jobs.ts).
 *
 * Production readiness (item 4, LAUNCH_AUDIT.md §7): every send now goes
 * through these rules, decided AT SEND TIME (so a retry hours later still
 * does the right thing):
 *  - Inside the 24-hour customer-service window: free-form text.
 *  - Outside it: the row's approved template if it has one
 *    (lib/whatsapp-templates.ts); otherwise the row fails for good --
 *    `template_not_configured` for a notice whose template isn't set up yet,
 *    `outside_24h_window` for a free-form reply -- and the conversation is
 *    flagged for the team. Nothing is sent and rejected by Meta.
 *  - Meta's 131047 (window closed between check and send) switches to the
 *    template once, or fails as above. Template errors, unreachable
 *    recipients, auth and other 4xx fail immediately (no pointless retries)
 *    and are flagged; only 5xx/throttling/network errors are retried.
 */

const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 60 * 60;
const DELIVERY_TIMEOUT_MS = 10_000;
const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const OUTBOUND_COLUMNS =
  "id, business_id, conversation_id, phone_number_id, to_wa_id, content, attempts, template_kind, template_name, template_language, template_params";

export type CreateWhatsappOutboundMessageInput = {
  businessId: string;
  conversationId: string;
  messageId: string;
  toWaId: string;
  phoneNumberId: string;
  content: string;
  /**
   * For system notices (appointment confirmations, reminders ...): which
   * template to use if the 24-hour window is closed when the row is sent.
   * `template` is null when that kind isn't configured/approved yet -- the
   * row then fails visibly as `template_not_configured` outside the window.
   */
  templateFallback?: { kind: WhatsappTemplateKind; template: ResolvedWhatsappTemplate | null; params: string[] };
};

/** Enqueues a reply for sending. Returns the created row's id, to pass to sendWhatsappOutboundMessage(). */
export async function createWhatsappOutboundMessage(
  supabase: ServiceSupabaseClient,
  input: CreateWhatsappOutboundMessageInput,
): Promise<{ id: string }> {
  const fallback = input.templateFallback;
  const { data, error } = await supabase
    .from("whatsapp_outbound_messages")
    .insert({
      business_id: input.businessId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      to_wa_id: input.toWaId,
      phone_number_id: input.phoneNumberId,
      content: input.content,
      template_kind: fallback?.kind ?? null,
      template_name: fallback?.template?.name ?? null,
      template_language: fallback?.template?.language ?? null,
      template_params: fallback?.template ? fallback.params : null,
    })
    .select("id")
    .single();

  if (error) {
    throw new AppError(
      "Something went wrong queuing this WhatsApp reply.",
      "createWhatsappOutboundMessage failed",
      error,
    );
  }

  return data;
}

function backoffSeconds(attempts: number): number {
  return Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
}

type WhatsappOutboundRow = {
  id: string;
  business_id: string;
  conversation_id: string;
  phone_number_id: string;
  to_wa_id: string;
  content: string;
  attempts: number;
  template_kind: string | null;
  template_name: string | null;
  template_language: string | null;
  template_params: string[] | null;
};

export type WhatsappSendResult = {
  success: boolean;
  sentAs?: "text" | "template";
  reason?:
    | "no_credentials"
    | "outside_24h_window"
    | "template_not_configured"
    | "template_rejected"
    | "recipient_unreachable"
    | "auth"
    | "rejected"
    | "retry_scheduled"
    | "failed";
};

/**
 * Sends one queued reply via Meta's Graph API. Never throws -- every
 * outcome (including a missing/errored connection or credential) is
 * recorded on the row itself and reflected in the return value, matching
 * lib/webhook-delivery.ts's contract.
 */
export async function sendWhatsappOutboundMessage(outboundId: string): Promise<WhatsappSendResult> {
  const supabase = createServiceSupabaseClient();

  const { data: outbound } = await supabase
    .from("whatsapp_outbound_messages")
    .select(OUTBOUND_COLUMNS)
    .eq("id", outboundId)
    .maybeSingle<WhatsappOutboundRow>();

  if (!outbound) {
    return { success: false, reason: "failed" };
  }

  try {
    return await deliverWhatsappOutboundRow(supabase, outbound);
  } catch {
    logEvent("whatsapp_delivery_unexpected_error", outbound.business_id, { outboundId: outbound.id }, "error");
    return { success: false, reason: "failed" };
  }
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

function templateOf(row: WhatsappOutboundRow): WhatsappTemplateRef | null {
  if (!row.template_name || !row.template_language || !Array.isArray(row.template_params)) return null;
  return { name: row.template_name, language: row.template_language, params: row.template_params };
}

/** Fails a row for good and makes it visible: the conversation is flagged and an error event logged. */
async function failPermanently(
  supabase: ServiceSupabaseClient,
  outbound: WhatsappOutboundRow,
  failureReason: string,
  details: Record<string, string | number | null> = {},
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabase
    .from("whatsapp_outbound_messages")
    .update({ status: "failed", failure_reason: failureReason, last_error: failureReason, updated_at: nowIso })
    .eq("id", outbound.id);

  const { data: business } = await supabase
    .from("businesses")
    .select("clerk_org_id")
    .eq("id", outbound.business_id)
    .maybeSingle<{ clerk_org_id: string }>();
  if (business) {
    await flagConversationNeedsAttention(supabase, outbound.business_id, outbound.conversation_id, business.clerk_org_id);
  }
  logEvent(
    "whatsapp_send_blocked",
    outbound.business_id,
    { outboundId: outbound.id, conversationId: outbound.conversation_id, reason: failureReason, templateKind: outbound.template_kind, ...details },
    "error",
  );
}

type GraphSendOutcome =
  | { ok: true; waMessageId: string | null }
  | { ok: false; status: number; errorClass: WhatsappSendErrorClass; code: number | null };

async function postToGraph(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<GraphSendOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = readWhatsappGraphError(body);
      return { ok: false, status: response.status, errorClass: classifyWhatsappSendError(response.status, error), code: error.code };
    }
    const waMessageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;
    return { ok: true, waMessageId };
  } catch {
    // Network error or our own timeout: retryable.
    return { ok: false, status: 0, errorClass: "transient", code: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliverWhatsappOutboundRow(
  supabase: ServiceSupabaseClient,
  outbound: WhatsappOutboundRow,
): Promise<WhatsappSendResult> {
  const [{ data: credentials }, lastInbound] = await Promise.all([
    supabase
      .from("whatsapp_credentials")
      .select("access_token")
      .eq("business_id", outbound.business_id)
      .maybeSingle<{ access_token: string }>(),
    lastInboundAt(supabase, outbound.business_id, outbound.conversation_id),
  ]);

  if (!credentials) {
    await failPermanently(supabase, outbound, "no_credentials");
    return { success: false, reason: "no_credentials" };
  }

  const template = templateOf(outbound);
  const decision = decideWhatsappSend({
    withinWindow: isWithinWhatsappWindow(lastInbound, new Date()),
    templateKind: outbound.template_kind,
    template,
  });

  if (decision.kind === "blocked") {
    await failPermanently(supabase, outbound, decision.reason);
    return { success: false, reason: decision.reason };
  }

  let sentAs: "text" | "template" = decision.kind;
  let outcome = await postToGraph(
    outbound.phone_number_id,
    credentials.access_token,
    decision.kind === "text"
      ? buildWhatsappPayload(outbound.to_wa_id, { kind: "text", text: outbound.content })
      : buildWhatsappPayload(outbound.to_wa_id, { kind: "template", template: decision.template }),
  );

  // The window closed between our check and Meta's (clock skew, a slow
  // retry): switch to the template once if there is one.
  if (!outcome.ok && outcome.errorClass === "outside_window" && sentAs === "text" && template) {
    sentAs = "template";
    outcome = await postToGraph(
      outbound.phone_number_id,
      credentials.access_token,
      buildWhatsappPayload(outbound.to_wa_id, { kind: "template", template }),
    );
  }

  if (outcome.ok) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "sent",
        sent_as: sentAs,
        wa_message_id: outcome.waMessageId,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", outbound.id);
    logEvent("whatsapp_delivery_succeeded", outbound.business_id, { outboundId: outbound.id, sentAs });
    return { success: true, sentAs };
  }

  if (!isRetryableWhatsappError(outcome.errorClass)) {
    const reason: WhatsappSendResult["reason"] =
      outcome.errorClass === "outside_window"
        ? template
          ? "template_rejected"
          : outbound.template_kind
            ? "template_not_configured"
            : "outside_24h_window"
        : outcome.errorClass === "template_error"
          ? "template_rejected"
          : outcome.errorClass === "recipient_unreachable"
            ? "recipient_unreachable"
            : outcome.errorClass === "auth"
              ? "auth"
              : "rejected";
    await failPermanently(supabase, outbound, reason ?? "rejected", { metaCode: outcome.code, httpStatus: outcome.status, sentAs });
    return { success: false, reason };
  }

  const attempts = outbound.attempts + 1;
  const isDeadLetter = attempts >= MAX_DELIVERY_ATTEMPTS;
  await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: isDeadLetter ? "failed" : "pending",
      attempts,
      failure_reason: isDeadLetter ? "retries_exhausted" : null,
      last_error: `Graph API responded with status ${outcome.status}${outcome.code ? ` (code ${outcome.code})` : ""}`,
      next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", outbound.id);

  logEvent(
    isDeadLetter ? "whatsapp_delivery_dead_lettered" : "whatsapp_delivery_retry_scheduled",
    outbound.business_id,
    { outboundId: outbound.id, attempts, metaCode: outcome.code },
    isDeadLetter ? "error" : undefined,
  );
  return { success: false, reason: isDeadLetter ? "failed" : "retry_scheduled" };
}

export type ProcessWhatsappOutboundResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

/** Sweeps pending/backed-off deliveries. Called from the scheduler (lib/scheduler/jobs.ts). */
export async function processWhatsappOutboundMessages(): Promise<ProcessWhatsappOutboundResult> {
  const supabase = createServiceSupabaseClient();

  const { data: claimed, error: claimError } = await supabase.rpc("claim_whatsapp_outbound_messages", {
    p_limit: MAX_DELIVERIES_PER_RUN,
  });

  if (claimError) {
    logEvent("whatsapp_delivery_claim_failed", "unknown", {}, "error");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const rows = (claimed ?? []) as WhatsappOutboundRow[];
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    let result: WhatsappSendResult;
    try {
      result = await deliverWhatsappOutboundRow(supabase, row);
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
